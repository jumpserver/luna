use crate::commands::requests::ApiResponse;
use crate::models::CookieMessage;
use chrono::{Local, Offset};
use log::{error, info, warn};
use tauri::{AppHandle, LogicalSize, Manager, WebviewWindow};
use tauri_plugin_store::StoreExt;
use tokio::time::{sleep, Duration};
use url::Url;

/// 重试获取窗口
async fn get_window_with_retry(
    app: &AppHandle,
    window_label: &str,
    max_retries: u32,
) -> Option<WebviewWindow> {
    for i in 0..max_retries {
        if let Some(window) = app.get_webview_window(window_label) {
            if i > 0 {
                info!("窗口 '{}' 在第 {} 次重试后找到", window_label, i + 1);
            }
            return Some(window);
        }

        if i == 0 {
            info!("窗口 '{}' 未就绪，开始重试", window_label);
        } else {
            info!("窗口 '{}' 第 {} 次重试", window_label, i + 1);
        }

        // 第一次立即重试，之后每次等待 100ms
        if i > 0 {
            sleep(Duration::from_millis(100)).await;
        }
    }
    warn!(
        "窗口 '{}' 在 {} 次重试后仍未找到",
        window_label, max_retries
    );
    None
}

/// 获取窗口 cookies
pub async fn get_window_cookies(
    app: &AppHandle,
    window_label: &str,
    origin: &str,
) -> Result<Vec<CookieMessage>, String> {
    // 等待窗口可用，最多重试 10 次
    let win = get_window_with_retry(app, window_label, 10)
        .await
        .ok_or_else(|| format!("window '{}' not found after retries", window_label))?;
    
    // 允许传入裸域名/IP，失败时默认补全 https:// 再解析
    let url = Url::parse(origin)
        .or_else(|_| Url::parse(&format!("https://{}", origin)))
        .map_err(|e| e.to_string())?;
    let target_domain = url.host_str().unwrap_or("").trim_start_matches('.').to_string();
    let target_is_ip = target_domain.parse::<std::net::IpAddr>().is_ok();

    sleep(Duration::from_millis(1000)).await;

    let all_cookies = win.cookies().map_err(|e| e.to_string())?;
    let cookies: Vec<_> = all_cookies
        .into_iter()
        .filter(|cookie| {
            if target_is_ip {
                return true;
            }

            let domain_opt = cookie.domain();
            let domain = domain_opt.unwrap_or("");
            let cd = domain.trim_start_matches('.');
            let td = target_domain.as_str();

            let exact_or_subdomain =
                !cd.is_empty() && (cd == td || cd.ends_with(&format!(".{}", td)) || td.ends_with(&format!(".{}", cd)));
            let host_only_cookie = domain_opt.is_none() && !td.is_empty();

            exact_or_subdomain || host_only_cookie
        })
        .collect();

    let mut cookie_list: Vec<CookieMessage> = cookies
        .into_iter()
        .map(|cookie| CookieMessage {
            name: cookie.name().to_string(),
            value: cookie.value().to_string(),
            domain: cookie.domain().unwrap_or_default().to_string(),
            path: cookie.path().unwrap_or("/").to_string(),
            secure: cookie.secure().unwrap_or(false),
            http_only: cookie.http_only().unwrap_or(false),
        })
        .collect();

    // 去重并排序cookies，确保一致性
    dedupe_cookies(&mut cookie_list);

    Ok(cookie_list)
}

/// 去重并排序cookies，保留最新的值
pub fn dedupe_cookies(cookies: &mut Vec<CookieMessage>) {
    // 使用HashMap根据(domain, path, name)进行去重，保留最后一个
    let mut unique_cookies = std::collections::HashMap::new();

    for cookie in cookies.iter() {
        let key = (
            cookie.domain.clone(),
            cookie.path.clone(),
            cookie.name.clone(),
        );
        unique_cookies.insert(key, cookie.clone());
    }

    // 转换回Vec并排序
    let mut result: Vec<CookieMessage> = unique_cookies.into_values().collect();
    result.sort_by(|a, b| {
        (a.domain.as_str(), a.path.as_str(), a.name.as_str()).cmp(&(
            b.domain.as_str(),
            b.path.as_str(),
            b.name.as_str(),
        ))
    });

    *cookies = result;
}

/// 格式化 cookies
pub fn format_cookies(cookie_list: &Vec<CookieMessage>) -> String {
    cookie_list
        .iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ")
}

pub fn extract_csrf_token(header_cookie: &str) -> String {
    let pairs: Vec<(String, String)> = header_cookie
        .split(';')
        .filter_map(|kv| {
            let kv = kv.trim();
            kv.split_once('=')
                .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
        })
        .collect();

    if let Some((_, v)) = pairs.iter().find(|(k, _)| k == "jms_csrftoken") {
        return v.clone();
    }

    if let Some((_, v)) = pairs.iter().find(|(k, _)| k == "csrftoken") {
        return v.clone();
    }

    String::new()
}

/// 获取本地时区偏移字符串
pub fn tz_offset_string() -> String {
    let local_offset = Local::now().offset().fix().local_minus_utc();
    let hours = local_offset / 3600;
    let minutes = (local_offset % 3600) / 60;

    format!("{:+03}:{:02}", hours, minutes)
}

/// 将请求结果转换为 ApiResponse
pub async fn to_api_response(
    url: &str,
    result: Result<reqwest::Response, reqwest::Error>,
) -> ApiResponse {
    match result {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let data = resp.text().await.unwrap_or_default();

            ApiResponse {
                status,
                data,
                success: status == 200 || status == 201 || status == 204,
            }
        }
        Err(e) => {
            log::warn!("请求 {} 失败: {}", url, e);
            ApiResponse {
                status: 0,
                data: format!("请求失败: {}", e),
                success: false,
            }
        }
    }
}

/// 初始化并持久化窗口尺寸（存逻辑尺寸 DIP），避免跨显示器缩放导致的视觉尺寸变化。
/// - 存储：逻辑像素宽高（width/height，DIP）
///
/// - 恢复：
///         直接按逻辑尺寸 set_size；若仅有旧的物理像素存档（width_px/height_px），则按当前缩放换算为逻辑尺寸后再设置。
///         Tauri/底层窗口系统会根据 当前屏幕的 scale factor，自动把逻辑尺寸换算成物理像素
///
/// - 原理：逻辑像素 × 缩放比 = 物理像素; 只在 “尺寸变化/应用打开” 时关心缩放比，中间存的永远是逻辑尺寸
pub fn setup_window_size_persistence(win: WebviewWindow) {
    // 恢复上次保存的尺寸
    if let Err(e) = restore_window_size(&win) {
        warn!("restore_window_size failed: {}", e);
    }

    // 监听窗口变化，记录 DIP
    let h = win.app_handle().clone();
    let win_for_events = win.clone();
    win.on_window_event(move |event| match event {
        tauri::WindowEvent::Resized(size) => {
            // 将事件给出的物理尺寸转换为逻辑尺寸：logical = physical / scale_factor
            let factor = win_for_events.scale_factor().ok().unwrap_or(1.0) as f64;
            let width_logical = (size.width as f64 / factor).max(1.0);
            let height_logical = (size.height as f64 / factor).max(1.0);

            if let Err(e) = save_window_logical_size(&h, width_logical, height_logical) {
                error!("save_window_size (logical) failed: {}", e);
            }
        }
        _ => {}
    });
}

fn save_window_logical_size(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let store = app
        .store("app_data.json")
        .map_err(|e| format!("open store failed: {}", e))?;

    store.set(
        "window_size",
        serde_json::json!({
            "width": width,
            "height": height,
        }),
    );

    store
        .save()
        .map_err(|e| format!("store save failed: {}", e))
}

fn restore_window_size(win: &WebviewWindow) -> Result<(), String> {
    let app: &AppHandle = win.app_handle();
    let store = app
        .store("app_data.json")
        .map_err(|e| format!("open store failed: {}", e))?;

    let saved: Option<serde_json::Value> = store.get("window_size");

    if saved.is_none() {
        return Ok(());
    }

    let v = saved.unwrap();

    // 优先使用逻辑像素
    let (width_logical, height_logical) = if let (Some(wl), Some(hl)) = (
        v.get("width").and_then(|x| x.as_f64()),
        v.get("height").and_then(|x| x.as_f64()),
    ) {
        (wl, hl)
    } else if let (Some(wpx), Some(hpx)) = (
        v.get("width_px").and_then(|x| x.as_f64()),
        v.get("height_px").and_then(|x| x.as_f64()),
    ) {
        // 从物理像素换算为逻辑尺寸
        let factor = win
            .scale_factor()
            .map_err(|e| format!("scale_factor failed: {}", e))? as f64;
        (wpx / factor, hpx / factor)
    } else {
        return Ok(());
    };

    // 避免设置到 0 或负数
    let w = width_logical.max(1.0);
    let h = height_logical.max(1.0);

    win.set_size(tauri::Size::Logical(LogicalSize::new(w, h)))
        .map_err(|e| format!("set_size failed: {}", e))?;

    let _ = save_window_logical_size(&app, w, h);

    Ok(())
}
