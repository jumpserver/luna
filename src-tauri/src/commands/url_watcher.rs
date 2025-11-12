use crate::service::user::UserService;
use crate::utils::{format_cookies, get_window_cookies};

use log::info;
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
        // 窗口创建宽限期（用于区分“未就绪/未创建”与“用户关闭”）
        let create_grace = Duration::from_secs(5);
        // 是否曾经拿到过该窗口
        let mut seen_window = false;
        // 仅打印一次等待日志，避免刷屏
        let mut logged_waiting = false;

        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            ticker.tick().await;

            // 超时直接判定失败
            if start.elapsed() >= timeout {
                let _ = app.emit(
                    "login-failed-timeout",
                    json!({
                        "status": "failure",
                        "reason": "timeout",
                        "message": "超过 60 秒未检测到有效登录状态，已中止登录",
                    }),
                );

                if let Some(window) = app.get_webview_window(&name) {
                    let _ = window.close();
                }
                break;
            }

            // 窗口状态处理：
            // - 尚未创建：在宽限期内继续等待；
            // - 曾经存在后丢失：视为用户关闭，结束监听；
            match app.get_webview_window(&name) {
                Some(_) => {
                    seen_window = true;
                }
                None => {
                    if !seen_window {
                        if start.elapsed() < create_grace {
                            if !logged_waiting {
                                info!("等待登录窗口创建...");
                                logged_waiting = true;
                            }
                            continue;
                        } else {
                            info!("登录窗口未创建或已被立即关闭，结束监听");
                            break;
                        }
                    } else {
                        info!("检测到登录窗口被关闭，结束监听");
                        break;
                    }
                }
            }

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
                let version_message = user_service.get_version_message().await;

                info!("version_message: {:?}", version_message);

                let version = 
                    if version_message.status == 200 && version_message.success {
                        version_message.data
                    } else if version_message.status == 404 {
                        "incompatible".to_string()
                    } else {
                        "".to_string()
                    };

                let _ = app.emit(
                    "login-success-detected",
                    json!({
                        "status": "success",
                        "profile": user_data.profile,
                        "permission_orgs": user_data.permission_orgs,
                        "current_org": user_data.current_org,
                        "cookies": cookie_header,
                        "version": version,
                    }),
                );

                if let Some(window) = app.get_webview_window(&name) {
                    let _ = window.close();
                }
                break;
            }
        }
    });
}
