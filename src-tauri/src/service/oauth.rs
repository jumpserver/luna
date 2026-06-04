use crate::api::client::oauth_client;
use crate::api::endpoint;
use crate::service::token::TokenService;
use anyhow::Result;
use chrono::{Duration, Utc};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, CsrfToken, EndpointNotSet,
    EndpointSet, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, RefreshToken, RevocationUrl,
    Scope, StandardRevocableToken, TokenResponse, TokenUrl,
};
use reqwest::Client;
use serde::Deserialize;
use std::sync::Mutex;
use tokio::sync::oneshot;
use url::Url;

pub type JumpServerOAuthClient =
    BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>;

/// OAuth 授权请求阶段的数据。
///
/// 创建授权 URL 后返回给 command 层使用：
/// - `auth_url` 发给前端打开浏览器
/// - `pkce_verifier` 和 `csrf` 暂存到 `AuthFlowState`，等待 callback 时校验和换 token
pub struct OAuthAuthorizationRequest {
    pub auth_url: String,
    pub pkce_verifier: PkceCodeVerifier,
    pub csrf: CsrfToken,
}

/// 已注册并等待回调的 OAuth 授权流程。
///
/// command 层拿到它后，先把 `auth_url` 发给前端，再等待 `callback_rx`
/// 接收 deep link 或 dev HTTP callback 解析出的授权码。
pub struct PendingAuthorization {
    pub auth_url: String,
    pub callback_rx: oneshot::Receiver<CallbackParams>,
}

/// OAuth token 交换或刷新后的结果。
///
/// 登录成功和 refresh token 阶段都会生成这份数据，随后写入本地 token 存储。
pub struct OAuthTokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
}

/// OAuth callback 阶段解析出的参数。
///
/// `code` 用于换取 token；`state`、`pkce_verifier`、`csrf` 用于完成 CSRF 校验和 PKCE 校验。
pub struct CallbackParams {
    pub code: AuthorizationCode,
    pub state: Option<String>,
    pub pkce_verifier: PkceCodeVerifier,
    pub csrf: CsrfToken,
}

/// JumpServer OAuth 服务端配置。
///
/// 登录开始阶段从 well-known endpoint 获取，当前主要使用其中的 `client_id`，
/// 其它字段保留用于描述服务端能力和后续兼容。
#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct OAuthConfig {
    pub issuer: String,
    pub client_id: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub revocation_endpoint: String,
    pub response_types_supported: Vec<String>,
    pub grant_types_supported: Vec<String>,
    pub scopes_supported: Vec<String>,
    pub token_endpoint_auth_methods_supported: Vec<String>,
    pub revocation_endpoint_auth_methods_supported: Vec<String>,
    pub code_challenge_methods_supported: Vec<String>,
    pub response_modes_supported: Vec<String>,
    pub token_expires_in: i64,
    pub refresh_token_expires_in: i64,
}

/// 登录发起后暂存在内存里的 OAuth 上下文。
///
/// 这是内部结构，只在等待 callback 的阶段存在；callback 到达后会被取出并发送给等待中的登录任务。
struct PendingAuth {
    pkce_verifier: PkceCodeVerifier,
    csrf: CsrfToken,
    tx: oneshot::Sender<CallbackParams>,
}

/// OAuth 登录流程的共享状态。
///
/// Tauri 管理这个状态，deep link 和 dev HTTP callback 都通过它把授权结果交回正在等待的 `auth_login`。
#[derive(Default)]
pub struct AuthFlowState {
    pending: Mutex<Option<PendingAuth>>,
}

impl OAuthTokenSet {
    /// 将 OAuth token 写入本地安全存储。
    pub async fn persist(&self, site: &str, client_id: &str) -> Result<()> {
        let token_service = TokenService::new(site.to_string());

        token_service
            .persist(
                &self.access_token,
                self.refresh_token.as_deref(),
                self.expires_at,
                Some(client_id),
            )
            .await
    }
}

impl AuthFlowState {
    /// deep link 或 dev HTTP callback 解析到 code/state 后，调用这里唤醒登录流程。
    pub fn handle_callback(&self, raw_url: &str) {
        let Ok(url) = Url::parse(raw_url) else {
            return;
        };

        let mut code = None;
        let mut state = None;

        for (key, value) in url.query_pairs() {
            // query_pairs 返回 Cow<str>，这里转成 &str 方便和字符串字面量匹配。
            match key.as_ref() {
                "code" => code = Some(value.to_string()),
                "state" => state = Some(value.to_string()),
                _ => {}
            }
        }

        let Some(code) = code else {
            return;
        };

        if let Ok(mut guard) = self.pending.lock() {
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

    /// 注册一次正在等待回调的 OAuth 授权流程。
    pub fn register_authorization(
        &self,
        authorize: OAuthAuthorizationRequest,
    ) -> PendingAuthorization {
        let (tx, callback_rx) = oneshot::channel();

        {
            let mut guard = self.pending.lock().expect("lock poisoned");
            *guard = Some(PendingAuth {
                pkce_verifier: authorize.pkce_verifier,
                csrf: authorize.csrf,
                tx,
            })
        }

        PendingAuthorization {
            auth_url: authorize.auth_url,
            callback_rx,
        }
    }

    /// 取消当前正在等待回调的 OAuth 授权流程。
    pub fn cancel(&self) {
        if let Ok(mut guard) = self.pending.lock() {
            let _ = guard.take();
        }
    }
}

/// 从 JumpServer 获取 OAuth 服务端配置。
pub async fn fetch_oauth_config(site: &str, client: &Client) -> Result<OAuthConfig> {
    let config_url = format!("{}{}", site, endpoint::oauth::WELL_KNOWN);

    let response = client.get(config_url).send().await?;
    let status = response.status();
    let text = response.text().await?;

    if !status.is_success() {
        anyhow::bail!("OAuth config endpoint returned {}: {}", status, text);
    }

    let config = serde_json::from_str::<OAuthConfig>(&text)?;

    Ok(config)
}

/// 构建 JumpServer OAuth client。
pub fn build_oauth_client(site: &str, client_id: &str) -> Result<JumpServerOAuthClient> {
    let client = BasicClient::new(ClientId::new(client_id.to_string()))
        // 指定授权端点：用户会被重定向到这个 URL 登录授权
        .set_auth_uri(AuthUrl::new(format!(
            "{}{}",
            site,
            endpoint::oauth::AUTHORIZE
        ))?)
        // 指定令牌端点：后续用 code 或 refresh_token 换取 access_token。
        .set_token_uri(TokenUrl::new(format!(
            "{}{}",
            site,
            endpoint::oauth::TOKEN
        ))?)
        // Debug 模式走本地 HTTP callback，Release 走 deep link callback。
        .set_redirect_uri(RedirectUrl::new(oauth_redirect_uri().to_string())?);

    Ok(client)
}

/// 创建 OAuth 授权请求，生成授权 URL、PKCE verifier 和 CSRF token。
pub fn create_authorization_request(client: &JumpServerOAuthClient) -> OAuthAuthorizationRequest {
    // 生成 PKCE
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // 生成 授权 URL
    let (auth_url, csrf) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("write".to_string()))
        .add_scope(Scope::new("read".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    OAuthAuthorizationRequest {
        auth_url: auth_url.to_string(),
        pkce_verifier,
        csrf,
    }
}

/// 使用 OAuth callback 中的 code + PKCE verifier 换取 token。
pub async fn exchange_authorization_code(
    client: &JumpServerOAuthClient,
    http_client: &Client,
    callback: CallbackParams,
) -> Result<OAuthTokenSet> {
    // 校验 state，防止 CSRF。
    if let Some(state) = callback.state.as_ref() {
        if state != callback.csrf.secret() {
            anyhow::bail!("state mismatch");
        }
    }

    let token_result = client
        .exchange_code(callback.code)
        .set_pkce_verifier(callback.pkce_verifier)
        .request_async(http_client)
        .await?;

    let access_token = token_result.access_token().secret().to_owned();
    let refresh_token = token_result
        .refresh_token()
        .map(|token| token.secret().to_owned());
    let expires_at = expires_at_timestamp(token_result.expires_in());

    Ok(OAuthTokenSet {
        access_token,
        refresh_token,
        expires_at,
    })
}

/// 撤销并删除本地保存的 OAuth token。
pub async fn revoke_and_clear_tokens(site: &str) -> Result<()> {
    let token_service = TokenService::new(site.to_string());

    if let Some(entry) = token_service.load().await? {
        if let Some(refresh_token) = entry.refresh_token {
            let client_id = entry.client_id.unwrap_or_default();
            let http_client = oauth_client()?;

            if let Err(error) =
                revoke_refresh_token(&site, &client_id, &refresh_token, &http_client).await
            {
                log::error!("revocation request failed: {}", error);
            }
        }

        token_service.delete().await?
    }

    Ok(())
}

/// 确保 access_token 可用；如果即将过期，则使用 refresh_token 刷新并写回本地存储。
pub async fn ensure_fresh_token(site: &str, provided: Option<&str>) -> Result<String> {
    let token_service = TokenService::new(site.to_string());
    let entry = token_service.load().await?;

    let stored_access = entry.as_ref().map(|token| token.access_token.clone());
    let stored_refresh = entry.as_ref().and_then(|token| token.refresh_token.clone());
    let expires_at = entry.as_ref().and_then(|token| token.expires_at);
    let client_id = entry
        .as_ref()
        .and_then(|token| token.client_id.clone())
        .unwrap_or_default();

    let mut access = stored_access.or_else(|| provided.map(str::to_string));

    if should_refresh_token(expires_at) {
        let refresh_token = stored_refresh
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("refresh_token missing for site {}", site))?;

        let http_client = oauth_client()?;
        let tokens = refresh_access_token(site, &client_id, refresh_token, &http_client).await?;

        tokens.persist(site, &client_id).await?;

        access = Some(tokens.access_token);
    }

    access.ok_or_else(|| anyhow::anyhow!("no access token available for site {}", site))
}

/// 判断 token 是否需要提前刷新。
fn should_refresh_token(expires_at: Option<i64>) -> bool {
    expires_at
        .map(|timestamp| timestamp <= Utc::now().timestamp() + 60)
        .unwrap_or(false)
}

/// 将 OAuth 返回的过期时长转换为本地时间戳。
fn expires_at_timestamp(expires_in: Option<std::time::Duration>) -> Option<i64> {
    expires_in
        .map(|duration| {
            Utc::now() + Duration::from_std(duration).unwrap_or_else(|_| Duration::seconds(0))
        })
        .map(|datetime| datetime.timestamp())
}

/// 根据运行模式返回 OAuth redirect_uri。
fn oauth_redirect_uri() -> &'static str {
    if cfg!(debug_assertions) {
        "http://127.0.0.1:14876/auth/callback"
    } else {
        "jms://auth/callback"
    }
}

/// 使用 refresh_token 刷新 access_token。
async fn refresh_access_token(
    site: &str,
    client_id: &str,
    refresh_token: &str,
    http_client: &Client,
) -> Result<OAuthTokenSet> {
    let client = BasicClient::new(ClientId::new(client_id.to_string())).set_token_uri(
        TokenUrl::new(format!("{}{}", site, endpoint::oauth::TOKEN))?,
    );

    let token_result = client
        .exchange_refresh_token(&RefreshToken::new(refresh_token.to_string()))
        .request_async(http_client)
        .await?;

    let access_token = token_result.access_token().secret().to_owned();
    let refresh_token = token_result
        .refresh_token()
        .map(|token| token.secret().to_owned())
        .unwrap_or_else(|| refresh_token.to_string());
    let expires_at = expires_at_timestamp(token_result.expires_in());

    Ok(OAuthTokenSet {
        access_token,
        refresh_token: Some(refresh_token),
        expires_at,
    })
}

/// 使用 refresh_token 向服务端发起撤销请求。
async fn revoke_refresh_token(
    site: &str,
    client_id: &str,
    refresh_token: &str,
    http_client: &Client,
) -> Result<()> {
    let client = BasicClient::new(ClientId::new(client_id.to_string())).set_revocation_url(
        RevocationUrl::new(format!("{}{}", site, endpoint::oauth::REVOKE))?,
    );

    let request = client
        .revoke_token(StandardRevocableToken::RefreshToken(RefreshToken::new(
            refresh_token.to_string(),
        )))
        .map_err(|error| anyhow::anyhow!("build revocation request failed: {}", error))?;

    request.request_async(http_client).await?;

    Ok(())
}
