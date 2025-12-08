#[allow(unused_imports)]
use crate::service::http_callback::start_http_callback_server;
use tauri::AppHandle;

/// 启动 HTTP 回调服务器 (开发环境)
#[tauri::command]
#[allow(unused_variables)]
pub async fn init_http_callback_server(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        tokio::spawn(async move {
            start_http_callback_server(app).await;
        });
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    {
        // 生产环境不需要启动
        Ok(())
    }
}
