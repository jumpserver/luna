use crate::service::user::UserService;
use crate::utils::{format_cookies, get_window_cookies};

use log::{info, warn};
use serde_json::json;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{self, MissedTickBehavior};

#[tauri::command]
pub fn url_watcher(app: AppHandle, name: String, origin: String) {
    tauri::async_runtime::spawn(async move {
        info!("开始监听 url 变化");

        let mut cookie_header: String = String::new();
        let mut ticker = time::interval(Duration::from_secs(2));

        let start = Instant::now();
        let timeout = Duration::from_secs(60);

        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            ticker.tick().await;

            // 超时直接判定失败
            if start.elapsed() >= timeout {
                let window = match app.get_webview_window(&name) {
                    Some(w) => w,
                    None => break,
                };
                let _ = app.emit(
                    "login-failed-timeout",
                    json!({
                        "status": "failure",
                        "reason": "timeout",
                        "message": "超过 60 秒未检测到有效登录状态，已中止登录",
                    }),
                );
                let _ = window.close();
                break;
            }

            let window = match app.get_webview_window(&name) {
                Some(w) => w,
                None => {
                    warn!("未检测到任何窗口，停止监听");
                    break;
                }
            };

            // 轮询获取 Cookies(第三方认证)
            if let Ok(cookies) = get_window_cookies(&app, &name, &origin).await {
                let new_header = format_cookies(&cookies);
                if !new_header.is_empty() && new_header != cookie_header {
                    cookie_header = new_header;
                }
            }

            if cookie_header.is_empty() {
                continue;
            }

            // 轮询调用直到 status 为 200
            let user_service = UserService::new(origin.clone(), cookie_header.clone());
            let profile = user_service.get_user_profile().await;

            info!("profile: {:?}", profile);

            if profile.status != 401 && profile.success {
                let user_data = user_service.init().await;

                let _ = app.emit(
                    "login-success-detected",
                    json!({
                        "status": "success",
                        "profile": user_data.profile,
                        "permission_orgs": user_data.permission_orgs,
                        "current_org": user_data.current_org,
                        "cookies": cookie_header,
                    }),
                );
                let _ = window.close();
                break;
            }
        }
    });
}
