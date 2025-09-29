use crate::utils::{format_cookies, get_window_cookies};
use crate::service::user::{UserService};

use log::{info, warn};
use serde_json::json;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{self, MissedTickBehavior};

#[tauri::command]
pub async fn url_watcher(app: AppHandle, name: String, origin: String) {
    tokio::spawn(async move {
        info!("开始监听 url 变化");

        let mut ticker = time::interval(Duration::from_secs(2));

        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

        let mut consecutive_cookie_errors: u32 = 0;
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

            // 通过周期性读取 cookies 并调用后端接口来判断是否登录
            let cookies = get_window_cookies(&app, &name, &origin).await;

            match cookies {
                Err(e) => {
                    consecutive_cookie_errors += 1;
                    warn!(
                        "获取 cookie 失败（第 {} 次）：{}",
                        consecutive_cookie_errors, e
                    );
                    if consecutive_cookie_errors >= 3 {
                        let _ = app.emit(
                            "login-failed-detected",
                            json!({
                                "status": "failure",
                                "reason": "cookie-query-failed",
                                "message": format!("连续 {} 次获取 Cookie 失败，已中止登录", consecutive_cookie_errors),
                            }),
                        );
                        let _ = window.close();
                        break;
                    }
                }
                Ok(cookies) => {
                    consecutive_cookie_errors = 0;
                    attempts += 1;

                    // 组装请求头 cookies
                    let cookie_header = format_cookies(&cookies);

                    // 还没拿到任何 cookies，继续等待
                    if cookie_header.is_empty() {
                        if attempts >= max_attempts {
                            let _ = app.emit(
                                "login-failed-detected",
                                json!({
                                    "status": "failure",
                                    "reason": "no-cookies",
                                    "message": "长时间未获取到登录 Cookies，已中止登录",
                                }),
                            );
                            let _ = window.close();
                            break;
                        }
                        continue;
                    }

                    // 轮询调用 get_user_profile，用于判断是否已登录（非 401 视为成功）
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
            }
        }
    });
}
