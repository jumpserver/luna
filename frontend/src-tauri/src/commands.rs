use log::{info, warn};
use tauri::{AppHandle, Emitter, Manager};
use std::time::Duration;
use tokio::time::interval;

use crate::models::CookieMessage;
use crate::utils::{cookies_changed, get_window_cookies};

#[tauri::command]
pub async fn start_cookie_watcher(
    app: AppHandle,
    window_label: String,
    origin: String,
) -> Result<Vec<CookieMessage>, String> {
    info!(
        "Starting cookie watcher - window: {}, origin: {}",
        window_label, origin
    );

    let initial = get_window_cookies(&app, &window_label, &origin).await.map_err(|e| {
        warn!("获取初始 cookies 失败: {e}");
        e
    })?;

    info!("初始 cookies 数量: {}", initial.len());

    let app_handle = app.clone();
    let window_label_cloned = window_label.clone();
    let origin_cloned = origin.clone();

    tokio::spawn(async move {
        let mut timer = interval(Duration::from_secs(2)); // 改为2秒检查一次
        let mut last = initial;
        let mut checks = 0usize;
        let max_checks = 150usize;

        info!("开始监听 cookies");

        loop {
            timer.tick().await;
            checks += 1;

            // 窗口关闭就退出
            if app_handle.get_webview_window(&window_label_cloned).is_none() {
                warn!("窗口 '{}' 已关闭，停止监听", window_label_cloned);
                break;
            }

            // 超时退出
            if checks > max_checks {
                warn!("监听超时，停止监听 cookies 变化");
                break;
            }

            info!("第 {} 次检查 cookies", checks);

            match get_window_cookies(&app_handle, &window_label_cloned, &origin_cloned).await {
                Ok(now) => {
                    info!("当前 cookies 数量: {}", now.len());
                    
                    if cookies_changed(&last, &now) {
                        info!("检测到 cookies 变化，发送通知");

                        if let Err(e) = app_handle.emit("login-cookies-detected", &now) {
                            warn!("发送事件失败: {e}");
                        } else {
                            info!("事件发送成功");
                        }

                        // 如需继续监听后续变化，改成 `last = now; continue;`
                        break;
                    } else {
                        info!("cookies 无变化，继续监听");
                    }

                    last = now;
                }
                Err(err) => {
                    warn!("获取 cookies 失败: {err}");
                }
            }
        }
    });

    Ok(get_window_cookies(&app, &window_label, &origin).await.unwrap_or_default())
}
