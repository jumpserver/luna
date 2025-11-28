use oauth2::{
    basic::BasicClient, reqwest, AuthUrl, AuthorizationCode, ClientId, CsrfToken,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, RequestTokenError, Scope,
    StandardErrorResponse, TokenResponse, TokenUrl,
};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;
use url::Url;

use crate::service::user::UserService;
use oauth2::basic::BasicErrorResponseType;
use oauth2::HttpClientError;

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

#[tauri::command]
pub async fn auth_login(
    app: AppHandle,
    flow_state: State<'_, AuthFlowState>,
    site: String,
) -> Result<(), String> {
    let fut = async {
        let client = BasicClient::new(ClientId::new(String::from(
            "FkkXFf0wPelYPIbvf0VElkZtyrw8TWIcyqakDgni",
        )))
        // 指定授权端点：用户会被重定向到这个 URL 登录/授权
        // 会自动拼上 response_type、client_id、redirect_uri、scope、state、code_challenge 等参数
        .set_auth_uri(AuthUrl::new(format!("{}/core/o/authorize/", site))?)
        // 指定令牌端点：将 code + pkce_verifier 或者 refresh_token
        // 向这个 URL 发 POST 来换取/刷新 access_token、id_token 等
        .set_token_uri(TokenUrl::new(format!("{}/core/o/token/", site))?)
        .set_redirect_uri(RedirectUrl::new(String::from("jms://oauth2/callback"))?);

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

        log::info!("Browse to: {}", auth_url);
        let _ = app.opener().open_url(auth_url, None::<&str>);

        let http_client = reqwest::ClientBuilder::new()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("Client no build");

        // 等待 deep link 回调传回 code/state
        let callback = rx
            .await
            .map_err(|_| anyhow::anyhow!("auth flow cancelled or timed out"))?;

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

        // 发起请求
        let user_service = UserService::new(site.clone(), access_token.clone());
        let (profile, permission_orgs, current_org, xpack_message, version_message) = tokio::join!(
            user_service.get_user_profile(),
            user_service.get_permission_orgs(),
            user_service.get_current_org(),
            user_service.get_xpack_message(),
            user_service.get_version_message(),
        );

        let version = if version_message.status == 200 && version_message.success {
            version_message.data
        } else if version_message.status == 404 {
            "incompatible".to_string()
        } else {
            "".to_string()
        };

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
                "version": version,
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

/// deep link on_open_url 解析到 code/state 后调用，把数据喂回正在等待的 auth_login。
pub fn handle_oauth_callback(flow_state: &State<'_, AuthFlowState>, raw_url: &str) {
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
            log::info!("Deep link received code, state={:?}", state);
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
