use std::time::Duration;
use log::{info, warn};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{self, sleep, MissedTickBehavior};
use crate::commands::requests::get;

pub async fn url_watcher(app: AppHandle, name: String, cookie_header: String) {
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
                        let _ = app.emit("login-success-detected", "success");

                        window.close().expect("关闭异常");

                        sleep(Duration::from_millis(1000)).await;

                        // 发送 profile 请求
                        let response = get("https://y4.cmdb.cc/api/v1/users/profile/", &cookie_header).await.expect("TODO: panic message");

                        println!("{}", response.as_str());
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