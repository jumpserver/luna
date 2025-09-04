use tauri::{AppHandle};
use log::info;
use crate::commands::url_watcher::url_watcher;
use crate::utils::get_window_cookies;

#[tauri::command]
pub async fn get_cookies(app: AppHandle, name: String, origin: String) -> Result<String, String> {
    // 从打开 login 页面的时候 cookies 信息就可以拿到了
    let cookies = get_window_cookies(&app, &name, &origin).await?;
    let cookie_header= cookies.iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ");

    info!("Get cookies: {:?}", cookie_header);

    url_watcher(app.clone(), name, cookie_header.clone()).await;

    Ok(cookie_header)
}
