use crate::utils::get_window_cookies;
use log::{info, warn};
use tauri::{AppHandle, Manager};

/// 清除站点 Cookies 信息
#[tauri::command]
pub async fn logout(app: AppHandle, name: String, origin: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&name)
        .or_else(|| app.get_webview_window("main"))
        .ok_or_else(|| format!("window '{}' not found", name))?;

    let cookies = get_window_cookies(&app, &name, &origin).await?;
    let total = cookies.len();
    let mut cleared = 0usize;

    let script = cookies
        .iter()
        .filter(|c| !c.http_only)
        .map(|c| {
            cleared += 1;
            format!(
                "document.cookie = '{}=; Max-Age=0; path={}; domain={}; SameSite=Lax';",
                c.name, c.path, c.domain
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    if script.is_empty() {
        warn!("未找到可清除的非 httpOnly Cookies 站点: {}", origin);
    } else {
        // eval 注入脚本清除 cookie
        window.eval(&script).map_err(|e| e.to_string())?;

        info!(
            "已清除 {} 个可见 Cookies(共匹配 {} 个)，站点: {}",
            cleared, total, origin
        );
    }

    for (_label, w) in app.webview_windows() {
        if let Err(e) = w.clear_all_browsing_data() {
            warn!("清理窗口 '{}' 浏览数据失败: {}", _label, e);
        }
    }

    Ok(())
}
