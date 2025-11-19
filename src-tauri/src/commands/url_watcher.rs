use crate::service::user::UserService;
use crate::utils::{format_cookies, get_window_cookies};

use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{self, MissedTickBehavior};
use url::Url;

#[tauri::command]
pub fn url_watcher(app: AppHandle, name: String, origin: String) {
    tauri::async_runtime::spawn(async move {
        log::info!("开始监听 url 变化");

        let mut cookie_header: String = String::new();
        let mut effective_origin = origin.clone();
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
                Some(window) => {
                    seen_window = true;

                    if let Ok(current_url) = window.url() {
                        if let Some(updated_origin) = http_origin_from_url(&current_url) {
                            if updated_origin != effective_origin {
                                log::info!(
                                    "检测到登录窗口跳转: {} -> 使用实际站点 {}",
                                    current_url,
                                    updated_origin
                                );
                                effective_origin = updated_origin;
                            }
                        }
                    }
                }
                None => {
                    if !seen_window {
                        if start.elapsed() < create_grace {
                            if !logged_waiting {
                                log::info!("等待登录窗口创建...");
                                logged_waiting = true;
                            }
                            continue;
                        } else {
                            log::info!("登录窗口未创建或已被立即关闭，结束监听");
                            break;
                        }
                    } else {
                        log::info!("检测到登录窗口被关闭，结束监听");
                        break;
                    }
                }
            }

            // 轮询获取 Cookies(第三方认证)
            if let Ok(cookies) = get_window_cookies(&app, &name, &effective_origin).await {
                let new_header = format_cookies(&cookies);
                if !new_header.is_empty() && new_header != cookie_header {
                    cookie_header = new_header;
                }
            }

            if cookie_header.is_empty() {
                continue;
            }

            // 轮询调用直到 status 为 200
            let user_service = UserService::new(effective_origin.clone(), cookie_header.clone());
            let profile = user_service.get_user_profile().await;

            log::info!("profile: {:?}", profile);

            if profile.status != 401 && profile.success {
                let xpack_message = user_service.get_xpack_message().await;
                let version_message = user_service.get_version_message().await;

                log::info!("public_message: {:?}", xpack_message);
                log::info!("version_message: {:?}", version_message);

                let version = if version_message.status == 200 && version_message.success {
                    version_message.data
                } else if version_message.status == 404 {
                    "incompatible".to_string()
                } else {
                    "".to_string()
                };

                let license_valid = if xpack_message.status == 200 && xpack_message.success {
                    serde_json::from_str::<Value>(&xpack_message.data)
                        .ok()
                        .and_then(|value| value.get("XPACK_LICENSE_IS_VALID").and_then(|v| v.as_bool()))
                        .unwrap_or(false)
                } else {
                    false
                };

                let user_data = user_service.init(profile, license_valid).await;

                let _ = app.emit(
                    "login-success-detected",
                    json!({
                        "status": "success",
                        "version": version,
                        "cookies": cookie_header,
                        "profile": user_data.profile,
                        "resolved_site": effective_origin,
                        "current_org": user_data.current_org,
                        "xpack_license_valid": license_valid,
                        "permission_orgs": user_data.permission_orgs,
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

fn http_origin_from_url(url: &Url) -> Option<String> {
    match url.scheme() {
        "http" | "https" => {
            let host = url.host_str()?;
            let mut origin = format!("{}://{}", url.scheme(), host);

            if let Some(port) = url.port() {
                origin.push(':');
                origin.push_str(&port.to_string());
            }

            Some(origin)
        }
        _ => None,
    }
}
