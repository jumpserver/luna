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

        loop {
            ticker.tick().await;

            let window = match app.get_webview_window(&name) {
                Some(w) => w,
                None => {
                    warn!("未检测到任何窗口，停止监听");
                    break;
                }
            };

            match window.url() {
                Ok(url) => {
                    let url_str = url.as_str();

                    info!("当前 url 为: {}", url_str);

                    if url_str.contains("/ui/#/") {
                        info!("检测到登录成功，停止监听");

                        // 获取全部 cookie
                        let cookies = get_window_cookies(&app, &name, &url_str).await;

                        match cookies {
                            Ok(cookies) => {
                                let cookie_header = format_cookies(&cookies);
                                info!("获取到的 cookie: {}", cookie_header);

                                let user_service = UserService::new(origin.clone(), cookie_header.clone());
                                let user_data = user_service.init().await;

                                window.close().expect("关闭异常");

                                if user_data.profile.success && user_data.permission_orgs.success && user_data.current_org.success {
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
                                } else {
                                    let _ = app.emit("login-failed-detected", json!({"status": "failure"}));
                                    warn!("获取用户初始信息失败!")
                                }
                            }
                            Err(e) => {
                                warn!("获取 cookie 失败: {}", e)
                            }
                        }
                        break;
                    }
                }
                Err(e) => {
                    warn!("获取 url 失败：{}", e);
                }
            }
        }
    });
}
