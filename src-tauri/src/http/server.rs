use crate::http::router::build_router;
use crate::http::state::HttpServerState;
use tauri::AppHandle;

const DEV_OAUTH_CALLBACK_ADDR: &str = "127.0.0.1:14876";

#[cfg(debug_assertions)]
pub(crate) async fn start_dev_http_server(app_handle: AppHandle) {
    let state = HttpServerState::new(app_handle);
    let app = build_router(state);

    let listener = match tokio::net::TcpListener::bind(DEV_OAUTH_CALLBACK_ADDR).await {
        Ok(listener) => listener,
        Err(error) => {
            log::error!(
                "Failed to bind dev HTTP server to {}: {}",
                DEV_OAUTH_CALLBACK_ADDR,
                error
            );

            return;
        }
    };

    log::info!(
        "Dev HTTP server started on http://{}/auth/callback",
        DEV_OAUTH_CALLBACK_ADDR
    );

    if let Err(error) = axum::serve(listener, app).await {
        log::error!("Dev HTTP server error: {}", error);
    }
}

#[cfg(not(debug_assertions))]
pub(crate) async fn start_dev_http_server(_app_handle: AppHandle) {}
