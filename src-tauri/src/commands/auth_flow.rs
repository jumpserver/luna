use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::api::client::{api_client, oauth_client};
use crate::service::oauth::{
    build_oauth_client, create_authorization_request, exchange_authorization_code,
    fetch_oauth_config, refresh_access_token, should_refresh_token, AuthFlowState,
};
use crate::service::token::TokenService;
use crate::service::user::UserService;

#[tauri::command]
pub async fn auth_login(
    app: AppHandle,
    flow_state: State<'_, AuthFlowState>,
    site: String,
) -> Result<(), String> {
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

    let fut = async {
        let client = build_oauth_client(&site, &client_id)?;

        // 生成 PKCE + 授权 URL
        let authorize = create_authorization_request(&client);
        let pending = flow_state.register_authorization(authorize);

        if let Err(e) = app.emit("auth_url", pending.auth_url) {
            log::warn!("emit auth_url failed: {}", e);
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

        // 保存 refresh token 等信息
        let token_service = TokenService::new(site.clone());
        if let Err(e) = token_service
            .persist(
                &tokens.access_token,
                tokens.refresh_token.as_deref(),
                tokens.expires_at,
                Some(&client_id),
            )
            .await
        {
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

/// 确保 access_token 新鲜；如过期则用 refresh_token 刷新并更新存储
pub async fn ensure_fresh_token(
    _app: &AppHandle,
    site: &str,
    provided: Option<&str>,
) -> anyhow::Result<String> {
    let token_service = TokenService::new(site.to_string());
    let entry = token_service.load().await?;

    let stored_access = entry.as_ref().map(|t| t.access_token.clone());
    let stored_refresh = entry.as_ref().and_then(|t| t.refresh_token.clone());
    let expires_at = entry.as_ref().and_then(|t| t.expires_at);
    let client_id = entry
        .as_ref()
        .and_then(|t| t.client_id.clone())
        .unwrap_or_else(|| "".to_string());

    let mut access = stored_access.or_else(|| provided.map(|p| p.to_string()));

    // 提前 60 秒刷新，避免请求发出时 token 刚好过期。
    let need_refresh = should_refresh_token(expires_at);

    if need_refresh {
        let refresh = stored_refresh
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("refresh_token missing for site {}", site))?;

        let http_client = oauth_client()?;
        let tokens = refresh_access_token(site, &client_id, refresh, &http_client).await?;

        token_service
            .persist(
                &tokens.access_token,
                tokens.refresh_token.as_deref(),
                tokens.expires_at,
                Some(&client_id),
            )
            .await?;

        access = Some(tokens.access_token);
    }

    access.ok_or_else(|| anyhow::anyhow!("no access token available for site {}", site))
}
