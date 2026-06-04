use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Html,
    routing::get,
    Router,
};
use serde::Deserialize;
use tauri::Manager;

use crate::{
    commands::auth_flow::{handle_auth_callback, AuthFlowState},
    http::state::HttpServerState,
};

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

pub(crate) fn routes() -> Router<HttpServerState> {
    Router::new().route("/auth/callback", get(handle_oauth_callback))
}

/// 处理开发环境下的 OAuth HTTP 回调
/// 函数的两个参数是 axum 的提取器写法
/// - State(state)  从 Router 共享状态里取出 HttpServerState
/// - Query(params) 从 URL query string 里解析出 CallbackQuery
async fn handle_oauth_callback(
    State(state): State<HttpServerState>,
    Query(params): Query<CallbackQuery>,
) -> (StatusCode, Html<&'static str>) {
    if let Some(error) = params.error {
        let description = params.error_description.unwrap_or_default();
        log::error!("OAuth callback error: {} - {}", error, description);

        return (
            StatusCode::BAD_REQUEST,
            Html(
                "<html><head><title>Authentication Error</title></head><body><h1>Authentication Error</h1><p>Please check the server logs.</p></body></html>",
            ),
        );
    }

    let Some(code) = params.code else {
        log::warn!("OAuth callback missing authorization code");

        return (
            StatusCode::BAD_REQUEST,
            Html(
                "<html><head><title>Invalid Callback</title></head><body><h1>Invalid Callback</h1><p>Missing authorization code.</p></body></html>",
            ),
        );
    };

    log::info!(
        "OAuth HTTP callback received: code={}, state={:?}",
        code.chars().take(20).collect::<String>(),
        params.state
    );

    let mut callback_url = format!("http://localhost/callback?code={}", code);
    if let Some(callback_state) = params.state {
        callback_url.push_str("&state=");
        callback_url.push_str(&callback_state);
    }

    let flow_state = state.app_handle().state::<AuthFlowState>();
    handle_auth_callback(&flow_state, &callback_url);

    (
        StatusCode::OK,
        Html(
            "<html><head><title>Authentication Successful</title></head><body><h1>Authentication Successful</h1><p>You can close this window and return to the application.</p></body></html>",
        ),
    )
}
