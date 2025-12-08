#[allow(unused_imports)]
use axum::{
    extract::Query,
    http::StatusCode,
    response::Html,
    routing::get,
    Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::commands::auth_login::{handle_auth_callback, AuthFlowState};

/// OAuth 回调查询参数
#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// 启动本地 HTTP 回调服务器 (仅在 Debug 模式)
/// 监听 http://127.0.0.1:14876/auth/callback
/// 此函数应该在异步上下文中调用
#[allow(dead_code)]
#[allow(unused_variables)]
pub async fn start_http_callback_server(app_handle: AppHandle) {
    #[cfg(debug_assertions)]
    {
        let app_handle = Arc::new(app_handle);
        
        let app_handle_clone = app_handle.clone();
        let app = Router::new()
            .route(
                "/auth/callback",
                get(move |Query(params): Query<CallbackQuery>| {
                    let app = app_handle_clone.clone();
                    async move {
                        handle_oauth_http_callback(params, app).await
                    }
                }),
            );

        let listener = match tokio::net::TcpListener::bind("127.0.0.1:14876").await {
            Ok(l) => l,
            Err(e) => {
                log::error!("Failed to bind HTTP callback server to 127.0.0.1:14876: {}", e);
                return;
            }
        };

        log::info!("✅ OAuth HTTP callback server started on http://127.0.0.1:14876/auth/callback");

        if let Err(e) = axum::serve(listener, app).await {
            log::error!("HTTP callback server error: {}", e);
        }
    }
}

/// 处理 OAuth HTTP 回调
#[allow(dead_code)]
async fn handle_oauth_http_callback(
    params: CallbackQuery,
    app_handle: Arc<AppHandle>,
) -> (StatusCode, Html<&'static str>) {
    if let Some(error) = params.error {
        let description = params.error_description.unwrap_or_default();
        log::error!("OAuth callback error: {} - {}", error, description);
        return (
            StatusCode::BAD_REQUEST,
            Html("<html><head><title>Authentication Error</title></head><body><h1>❌ Authentication Error</h1><p>Please check the server logs.</p></body></html>"),
        );
    }

    if params.code.is_none() {
        log::warn!("OAuth callback missing authorization code");
        return (
            StatusCode::BAD_REQUEST,
            Html("<html><head><title>Invalid Callback</title></head><body><h1>❌ Invalid Callback</h1><p>Missing authorization code.</p></body></html>"),
        );
    }

    let code = params.code.unwrap_or_default();
    let state = params.state.clone();

    log::info!(
        "✅ OAuth HTTP callback received: code={}, state={:?}",
        code.chars().take(20).collect::<String>(),
        state
    );

    // 构造 URL 字符串并调用 handle_auth_callback
    let mut url_str = format!("http://localhost/callback?code={}", code);
    if let Some(s) = state {
        url_str.push_str(&format!("&state={}", s));
    }

    // 从 AppHandle 中获取 AuthFlowState
    let flow_state = app_handle.state::<AuthFlowState>();
    handle_auth_callback(&flow_state, &url_str);

    (
        StatusCode::OK,
        Html("<html><head><title>Authentication Successful</title></head><body><h1>✅ Authentication Successful</h1><p>You can close this window and return to the application.</p></body></html>"),
    )
}
