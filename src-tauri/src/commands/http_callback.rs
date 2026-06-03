#[allow(unused_imports)]
use crate::http::server::start_dev_http_server;
use tauri::AppHandle;

/// 启动 HTTP 回调服务器 (开发环境)
#[tauri::command]
pub async fn init_http_callback_server(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        tokio::spawn(async move {
            start_dev_http_server(app).await;
        });
    }

    Ok(())
}
