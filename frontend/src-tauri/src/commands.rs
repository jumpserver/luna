use log::{info, warn};
use tauri::{AppHandle, Emitter, Manager};
use std::time::Duration;
use tokio::time::interval;
use std::collections::HashMap;
use serde_json;

use crate::models::{CookieMessage, cookies_to_header};
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
                        
                        // 详细记录变化的cookie信息
                        for (i, cookie) in now.iter().enumerate() {
                            info!("Changed Cookie {}: {}={} (domain: {}, path: {})", 
                                i + 1, 
                                cookie.name, 
                                if cookie.is_auth_cookie() { "[REDACTED]" } else { &cookie.value },
                                cookie.domain,
                                cookie.path
                            );
                        }

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

#[tauri::command]
pub async fn start_url_watcher(
    app: AppHandle,
    window_label: String,
    target_url_pattern: String, // 例如: "/#/ui"
) -> Result<(), String> {
    info!(
        "Starting URL watcher - window: {}, pattern: {}",
        window_label, target_url_pattern
    );

    let app_handle = app.clone();
    let window_label_cloned = window_label.clone();
    let pattern_cloned = target_url_pattern.clone();

    tokio::spawn(async move {
        let mut timer = interval(Duration::from_millis(500)); // 500ms检查一次URL变化
        let mut checks = 0usize;
        let max_checks = 600usize; // 5分钟超时

        info!("开始监听 URL 变化");

        loop {
            timer.tick().await;
            checks += 1;

            // 检查窗口是否还存在
            let window = match app_handle.get_webview_window(&window_label_cloned) {
                Some(w) => w,
                None => {
                    warn!("窗口 '{}' 已关闭，停止URL监听", window_label_cloned);
                    break;
                }
            };

            // 超时退出
            if checks > max_checks {
                warn!("URL监听超时，停止监听");
                break;
            }

            // 获取当前URL
            match window.url() {
                Ok(current_url) => {
                    let url_string = current_url.to_string();
                    
                    // 每10次检查打印一次当前URL，用于调试
                    if checks % 10 == 0 {
                        info!("第 {} 次检查，当前URL: {}", checks, url_string);
                    }
                    
                    if url_string.contains(&pattern_cloned) {
                        info!("检测到URL重定向到登录成功页面: {}", url_string);
                        
                        // 获取当前页面的cookies
                        match get_window_cookies(&app_handle, &window_label_cloned, &current_url.origin().ascii_serialization()).await {
                            Ok(cookies) => {
                                info!("登录成功，获取到 {} 个cookies", cookies.len());
                                
                                // 详细记录cookie信息
                                for (i, cookie) in cookies.iter().enumerate() {
                                    info!("Cookie {}: {}={} (domain: {}, path: {}, secure: {}, httpOnly: {})", 
                                        i + 1, 
                                        cookie.name, 
                                        if cookie.is_auth_cookie() { "[REDACTED]" } else { &cookie.value },
                                        cookie.domain,
                                        cookie.path,
                                        cookie.secure,
                                        cookie.http_only
                                    );
                                }
                                
                                // 生成cookie头字符串并记录
                                let cookie_header = cookies_to_header(&cookies);
                                info!("生成的Cookie头: {}", if cookie_header.len() > 200 { 
                                    format!("{}...[truncated, total length: {}]", &cookie_header[..200], cookie_header.len())
                                } else { 
                                    cookie_header 
                                });
                                
                                if let Err(e) = app_handle.emit("login-success-detected", &cookies) {
                                    warn!("发送登录成功事件失败: {e}");
                                } else {
                                    info!("登录成功事件发送成功");
                                }
                            }
                            Err(e) => {
                                warn!("获取登录成功后的cookies失败: {e}");
                                // 即使获取cookies失败，也发送登录成功事件
                                let _ = app_handle.emit("login-success-detected", Vec::<CookieMessage>::new());
                            }
                        }
                        
                        break;
                    }
                }
                Err(e) => {
                    // URL获取失败通常是因为页面还在加载，继续等待
                    if checks % 20 == 0 { // 每10秒打印一次日志避免刷屏
                        info!("第 {} 次检查，获取URL失败: {}", checks, e);
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn custom_http_request(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    info!("Custom HTTP request: {} {}", method, url);
    info!("Headers: {:?}", headers);

    let client = reqwest::Client::new();
    
    let mut request_builder = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("Unsupported HTTP method: {}", method)),
    };

    // 添加所有请求头
    for (key, value) in headers {
        request_builder = request_builder.header(&key, &value);
    }

    // 添加请求体（如果有）
    if let Some(body_content) = body {
        request_builder = request_builder.body(body_content);
    }

    match request_builder.send().await {
        Ok(response) => {
            info!("Response status: {}", response.status());
            
            match response.json::<serde_json::Value>().await {
                Ok(json_data) => {
                    info!("Response received successfully");
                    Ok(json_data)
                }
                Err(e) => {
                    warn!("Failed to parse JSON response: {}", e);
                    Err(format!("Failed to parse JSON response: {}", e))
                }
            }
        }
        Err(e) => {
            warn!("HTTP request failed: {}", e);
            Err(format!("HTTP request failed: {}", e))
        }
    }
}

/// 调试用：获取指定窗口的当前cookies并返回详细信息
#[tauri::command]
pub async fn debug_get_cookies(
    app: AppHandle,
    window_label: String,
    origin: String,
) -> Result<serde_json::Value, String> {
    info!("Debug: 获取窗口 {} 在 {} 上的cookies", window_label, origin);
    
    match get_window_cookies(&app, &window_label, &origin).await {
        Ok(cookies) => {
            info!("Debug: 成功获取到 {} 个cookies", cookies.len());
            
            let cookie_header = cookies_to_header(&cookies);
            let auth_cookies: Vec<&CookieMessage> = cookies.iter()
                .filter(|c| c.is_auth_cookie())
                .collect();
            
            let debug_info = serde_json::json!({
                "total_cookies": cookies.len(),
                "auth_cookies_count": auth_cookies.len(),
                "cookie_header": cookie_header,
                "cookie_header_length": cookie_header.len(),
                "cookies": cookies,
                "auth_cookie_names": auth_cookies.iter()
                    .map(|c| &c.name)
                    .collect::<Vec<_>>(),
                "origin": origin,
                "window_label": window_label
            });
            
            Ok(debug_info)
        }
        Err(e) => {
            warn!("Debug: 获取cookies失败: {}", e);
            Err(e)
        }
    }
}
