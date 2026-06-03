use chrono::{Duration, Utc};
use oauth2::{
    basic::BasicClient, reqwest, AuthUrl, AuthorizationCode, ClientId, CsrfToken,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, RefreshToken, Scope, TokenResponse, TokenUrl,
};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;
use url::Url;

use crate::api::client::oauth_client;
use crate::service::token_oauth::TokenService;
use crate::service::user::UserService;

/// 记录一次登录发起时的上下文（PKCE/CSRF 和回调通道）。
pub struct PendingAuth {
    pub pkce_verifier: PkceCodeVerifier,
    pub csrf: CsrfToken,
    pub tx: oneshot::Sender<CallbackParams>,
}

/// 全局保存正在进行的登录流程，等待 deep link 回调。
#[derive(Default)]
pub struct AuthFlowState {
    pub pending: Mutex<Option<PendingAuth>>,
}

/// deep link 回调携带的参数。
pub struct CallbackParams {
    pub code: AuthorizationCode,
    pub state: Option<String>,
    pub pkce_verifier: PkceCodeVerifier,
    pub csrf: CsrfToken,
}

#[derive(serde::Deserialize, Debug)]
#[allow(dead_code)]
struct OAuthConfig {
    issuer: String,
    client_id: String,
    authorization_endpoint: String,
    token_endpoint: String,
    revocation_endpoint: String,
    response_types_supported: Vec<String>,
    grant_types_supported: Vec<String>,
    scopes_supported: Vec<String>,
    token_endpoint_auth_methods_supported: Vec<String>,
    revocation_endpoint_auth_methods_supported: Vec<String>,
    code_challenge_methods_supported: Vec<String>,
    response_modes_supported: Vec<String>,
    token_expires_in: i64,
    refresh_token_expires_in: i64,
}

#[tauri::command]
pub async fn auth_login(
    app: AppHandle,
    flow_state: State<'_, AuthFlowState>,
    site: String,
) -> Result<(), String> {
    // 获取 OAuth 配置
    let config_url = format!(
        "{}/core/auth/oauth2-provider/.well-known/oauth-authorization-server",
        site
    );
    let config_http_client = reqwest::ClientBuilder::new()
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Client no build");

    let response = match config_http_client.get(config_url).send().await {
        Ok(resp) => resp,
        Err(e) => {
            let msg = format!("Failed to fetch OAuth config: {}", e);
            log::error!("{}", msg);
            let _ = app.emit(
                "error-page",
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

    let status = response.status();
    let text = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            let msg = format!("Failed to read response body: {}", e);
            log::error!("{}", msg);
            let _ = app.emit(
                "login-failed-detected",
                serde_json::json!({
                    "status": "failure",
                    "reason": "invalid-site",
                    "message": msg.clone(),
                    "site": site,
                    "http_status": status.as_u16(),
                }),
            );
            return Err(msg);
        }
    };

    if !status.is_success() {
        let msg = format!("OAuth config endpoint returned {}: {}", status, text);
        log::error!("{}", msg);
        let _ = app.emit(
            "login-failed-detected",
            serde_json::json!({
                "status": "failure",
                "reason": "invalid-site",
                "message": msg.clone(),
                "site": site,
                "http_status": status.as_u16(),
            }),
        );
        return Err(msg);
    }

    let oauth_config: OAuthConfig = match serde_json::from_str(&text) {
        Ok(cfg) => cfg,
        Err(e) => {
            let msg = format!(
                "Failed to parse OAuth config JSON: {}. Response: {}",
                e, text
            );
            log::error!("{}", msg);
            let _ = app.emit(
                "login-failed-detected",
                serde_json::json!({
                    "status": "failure",
                    "reason": "invalid-site",
                    "message": msg.clone(),
                    "site": site,
                    "http_status": status.as_u16(),
                }),
            );
            return Err(msg);
        }
    };

    let client_id = oauth_config.client_id;

    let fut = async {
        let client = BasicClient::new(ClientId::new(client_id.clone()))
            // 指定授权端点：用户会被重定向到这个 URL 登录/授权
            // 会自动拼上 response_type、client_id、redirect_uri、scope、state、code_challenge 等参数
            .set_auth_uri(AuthUrl::new(format!(
                "{}/core/auth/oauth2-provider/authorize/",
                site
            ))?)
            // 指定令牌端点：将 code + pkce_verifier 或者 refresh_token
            // 向这个 URL 发 POST 来换取/刷新 access_token、id_token 等
            .set_token_uri(TokenUrl::new(format!(
                "{}/core/auth/oauth2-provider/token/",
                site
            ))?)
            .set_redirect_uri(RedirectUrl::new({
                // Debug 模式使用 HTTP 本地回调，Release 使用 Deep Link
                if cfg!(debug_assertions) {
                    "http://127.0.0.1:14876/auth/callback"
                } else {
                    "jms://auth/callback"
                }
                .to_string()
            })?);

        // 生成 PKCE + 授权 URL
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
        let (auth_url, csrf_token) = client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new(String::from("write")))
            .add_scope(Scope::new(String::from("read")))
            .set_pkce_challenge(pkce_challenge)
            .url();

        // 保存这次发起的登录上下文，并挂起等待 deep link 回调。
        let (tx, rx) = oneshot::channel();
        {
            let mut guard = flow_state.pending.lock().expect("lock poisoned");
            *guard = Some(PendingAuth {
                pkce_verifier,
                csrf: csrf_token.clone(),
                tx,
            });
        }

        if let Err(e) = app.emit("auth_url", auth_url.to_string()) {
            log::warn!("emit auth_url failed: {}", e);
        }

        let http_client = oauth_client()?;

        // 等待 deep link 回调传回 code/state
        let callback = match rx.await {
            Ok(callback) => callback,
            Err(_) => {
                log::info!("auth flow cancelled");
                return Ok(());
            }
        };

        // 防止 CSRF
        if let Some(state) = callback.state.as_ref() {
            if state != callback.csrf.secret() {
                anyhow::bail!("state mismatch");
            }
        }

        let token_result = client
            .exchange_code(callback.code)
            .set_pkce_verifier(callback.pkce_verifier)
            .request_async(&http_client)
            .await?;

        let access_token = token_result.access_token().secret().to_owned();
        let refresh_token = token_result.refresh_token().map(|t| t.secret().to_owned());
        let expires_at = token_result
            .expires_in()
            .map(|dur| {
                Utc::now() + Duration::from_std(dur).unwrap_or_else(|_| Duration::seconds(0))
            })
            .map(|dt| dt.timestamp());

        // 保存 refresh token 等信息
        let token_service = TokenService::new(site.clone());
        if let Err(e) = token_service
            .persist(
                &access_token,
                refresh_token.as_deref(),
                expires_at,
                Some(&client_id),
            )
            .await
        {
            log::warn!("persist tokens failed: {}", e);
        }

        // 发起请求
        let user_service = UserService::new(site.clone(), access_token.clone())?;
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
                "bearer": access_token,
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
    if let Ok(mut guard) = flow_state.pending.lock() {
        let _ = guard.take();
    }
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

    // 则提前 60s 刷新
    let need_refresh = expires_at
        .map(|ts| ts <= Utc::now().timestamp() + 60)
        .unwrap_or(false);

    if need_refresh {
        let refresh = stored_refresh
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("refresh_token missing for site {}", site))?;

        let client = BasicClient::new(ClientId::new(client_id.clone())).set_token_uri(
            TokenUrl::new(format!("{}/core/auth/oauth2-provider/token/", site))?,
        );

        let http_client = oauth_client()?;
        let token_result = client
            .exchange_refresh_token(&RefreshToken::new(refresh.to_string()))
            .request_async(&http_client)
            .await?;

        let new_access = token_result.access_token().secret().to_owned();
        let new_refresh = token_result
            .refresh_token()
            .map(|t| t.secret().to_owned())
            .unwrap_or_else(|| refresh.to_string());
        let new_expires = token_result
            .expires_in()
            .map(|dur| {
                Utc::now() + Duration::from_std(dur).unwrap_or_else(|_| Duration::seconds(0))
            })
            .map(|dt| dt.timestamp());

        token_service
            .persist(
                &new_access,
                Some(&new_refresh),
                new_expires,
                Some(&client_id),
            )
            .await?;

        access = Some(new_access);
    }

    access.ok_or_else(|| anyhow::anyhow!("no access token available for site {}", site))
}

/// deep link on_open_url 解析到 code/state 后调用，把数据喂回正在等待的 auth_login。
pub fn handle_auth_callback(flow_state: &State<'_, AuthFlowState>, raw_url: &str) {
    if let Ok(url) = Url::parse(raw_url) {
        let mut code = None;
        let mut state = None;
        for (k, v) in url.query_pairs() {
            match k.as_ref() {
                "code" => code = Some(v.to_string()),
                "state" => state = Some(v.to_string()),
                _ => {}
            }
        }
        if let Some(code) = code {
            if let Ok(mut guard) = flow_state.pending.lock() {
                if let Some(pending) = guard.take() {
                    let _ = pending.tx.send(CallbackParams {
                        code: AuthorizationCode::new(code),
                        state,
                        pkce_verifier: pending.pkce_verifier,
                        csrf: pending.csrf,
                    });
                }
            }
        }
    }
}
