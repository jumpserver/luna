use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::api::client::{api_client, oauth_client};
use crate::service::oauth::{
    build_oauth_client, create_authorization_request, exchange_authorization_code,
    fetch_oauth_config, AuthFlowState,
};
use crate::service::user::UserService;

#[tauri::command]
pub async fn auth_login(
    app: AppHandle,
    flow_state: State<'_, AuthFlowState>,
    site: String,
) -> Result<(), String> {
    log::info!("auth_login started for site: {}", site);

    // 获取 OAuth 配置
    let config_http_client = api_client().map_err(|e| e.to_string())?;
    let oauth_config = match fetch_oauth_config(&site, &config_http_client).await {
        Ok(config) => config,
        Err(e) => {
            let msg = format!("Failed to fetch OAuth config: {}", e);
            log::error!("{}", msg);

            let _ = app.emit(
                "login-failed-detected",
                serde_json::json!({
                    "status": "failure",
                    "reason": "invalid-site",
                    "message": msg.clone(),
                    "site": site,
                }),
            );

            return Err(msg);
        }
    };

    let client_id = oauth_config.client_id;
    log::info!("OAuth config fetched for site: {}", site);

    let fut = async {
        let client = build_oauth_client(&site, &client_id)?;

        // 生成 PKCE + 授权 URL
        let authorize = create_authorization_request(&client);
        log::info!("OAuth authorization URL generated for site: {}", site);
        let pending = flow_state.register_authorization(authorize);

        match app.emit("auth_url", pending.auth_url) {
            Ok(_) => log::info!("auth_url emitted for site: {}", site),
            Err(e) => log::warn!("emit auth_url failed: {}", e),
        }

        let http_client = oauth_client()?;

        // 等待 deep link 回调传回 code/state
        let callback = match pending.callback_rx.await {
            Ok(callback) => callback,
            Err(_) => {
                log::info!("auth flow cancelled");
                return Ok(());
            }
        };

        let tokens = exchange_authorization_code(&client, &http_client, callback).await?;

        // 保存 OAuth token，供后续请求自动刷新使用。
        if let Err(e) = tokens.persist(&site, &client_id).await {
            log::warn!("persist tokens failed: {}", e);
        }

        // 发起请求
        let user_service = UserService::new(site.clone(), tokens.access_token.clone())?;
        let (profile, permission_orgs, current_org, xpack_message) = tokio::join!(
            user_service.get_user_profile(),
            user_service.get_permission_orgs(),
            user_service.get_current_org(),
            user_service.get_xpack_message(),
        );

        let license_valid = if xpack_message.status == 200 && xpack_message.success {
            serde_json::from_str::<Value>(&xpack_message.data)
                .ok()
                .and_then(|value| {
                    value
                        .get("XPACK_LICENSE_IS_VALID")
                        .and_then(|v| v.as_bool())
                })
                .unwrap_or(false)
        } else {
            false
        };

        let _ = app.emit(
            "login-success-detected",
            serde_json::json!({
                "status": "success",
                "bearer": tokens.access_token,
                "profile": profile,
                "resolved_site": site,
                "current_org": current_org,
                "xpack_license_valid": license_valid,
                "permission_orgs": permission_orgs,
            }),
        );

        Ok::<(), anyhow::Error>(())
    };

    fut.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn auth_cancel(flow_state: State<'_, AuthFlowState>) -> Result<(), String> {
    flow_state.cancel();
    Ok(())
}
