use crate::commands::requests::get;
use crate::utils::{format_cookies, get_window_cookies};

use log::{info, warn};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{self, MissedTickBehavior};
use serde_json::json;

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
                                let profile_url = format!("{}/api/v1/users/profile/", origin);

                                info!("获取到的 cookie: {}", cookie_header);

                                match get(&profile_url, &cookie_header).await {
                                    Ok(resp) => {
                                        let status = resp.status();
                                        let data = resp.text().await.unwrap_or_default();

                                        info!("响应状态: {}", status);
                                        println!("响应体: {}", data);

                                        if status == 200 {
                                            let _ = app.emit("login-success-detected", json!({
                                                "status": "success",
                                                "data": data,
                                            }));

                                            window.close().expect("关闭异常");
                                        }
                                    }
                                    Err(e) => {
                                        warn!("请求失败: {}", e);
                                    }
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