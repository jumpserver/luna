use crate::service::user::UserService;
use crate::utils::{format_cookies, get_window_cookies};

use log::{info, warn};
use serde_json::json;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{self, MissedTickBehavior};

#[tauri::command]
pub async fn url_watcher(app: AppHandle, name: String, origin: String) {
    tokio::spawn(async move {
        info!("开始监听 url 变化");

        // 仅在启动时读取一次 Cookies；如果读不到则视为非目标页面
        let initial_cookies_result = get_window_cookies(&app, &name, &origin).await;

        let cookie_header = match initial_cookies_result {
            Ok(cookies) => {
                let header = format_cookies(&cookies);

                if header.is_empty() {
                    info!("未获取到 Cookies");

                    let _ = app.emit(
                        "error-page",
                        json!({
                            "status": "failure",
                            "reason": "cookies-not-found",
                        }),
                    );

                    let _ = app.get_webview_window(&name).unwrap().close();
                    return;
                }

                header
            }
            Err(e) => {
                info!("获取 Cookies 失败，可能不是正确的登录页面：{}", e);

                let _ = app.emit(
                    "error-page",
                    json!({
                        "status": "failure",
                        "reason": "cookies-not-found",
                    }),
                );

                let _ = app.get_webview_window(&name).unwrap().close();
                return;
            }
        };

        let mut ticker = time::interval(Duration::from_secs(2));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

        let mut attempts: u32 = 0;
        let max_attempts: u32 = 60;

        loop {
            ticker.tick().await;

            let window = match app.get_webview_window(&name) {
                Some(w) => w,
                None => {
                    warn!("未检测到任何窗口，停止监听");
                    break;
                }
            };

            attempts += 1;

            // 仅使用启动时的 Cookies，轮询调用 get_user_profile 判断是否已登录（非 401 视为成功）
            let user_service = UserService::new(origin.clone(), cookie_header.clone());
            let profile = user_service.get_user_profile().await;

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

            // 达到最大尝试次数，判为失败
            if attempts >= max_attempts {
                let _ = app.emit(
                    "login-failed-detected",
                    json!({
                        "status": "failure",
                        "reason": "timeout-or-unauthorized",
                        "message": "长时间未检测到登录成功（Profile 一直未授权），已中止登录",
                    }),
                );
                let _ = window.close();
                break;
            }
        }
    });
}
