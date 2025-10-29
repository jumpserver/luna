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
    let target_domain = url.host_str().unwrap_or("");

    sleep(Duration::from_millis(1000)).await;

    let all_cookies = win.cookies().map_err(|e| e.to_string())?;
    let cookies: Vec<_> = all_cookies
        .into_iter()
        .filter(|cookie| {
            let domain = cookie.domain().unwrap_or("");
            // 更宽松的域名匹配：支持父子域
            let cd = domain.trim_start_matches('.');
            let td = target_domain.trim_start_matches('.');
            cd == td || cd.ends_with(&format!(".{}", td)) || td.ends_with(&format!(".{}", cd))
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
                success: status == 200 || status == 201,
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

/// 初始化并持久化窗口尺寸，避免跨显示器缩放导致的视觉尺寸变化。
/// - 存储：物理像素宽高（px）
/// - 恢复：按当前缩放系数换算为逻辑尺寸后 set_size
/// - 原理: 窗口尺寸变化时记录物理像素(px)，重启后从 store 读出 px，按当前缩放比换算为逻辑尺寸并应用为窗口大小
pub fn setup_window_size_persistence(win: WebviewWindow) {
    // 恢复上次保存的尺寸
    if let Err(e) = restore_window_size(&win) {
        warn!("restore_window_size failed: {}", e);
    }

    // 监听窗口变化,记录尺寸
    let h = win.app_handle().clone();

    win.on_window_event(move |event| match event {
        tauri::WindowEvent::Resized(size) => {
            let width_px = size.width as f64;
            let height_px = size.height as f64;

            if let Err(e) = save_window_size(&h, width_px, height_px) {
                error!("save_window_size failed: {}", e);
            }
        }
        _ => {}
    });
}

fn save_window_size(app: &AppHandle, width_px: f64, height_px: f64) -> Result<(), String> {
    let store = app
        .store("app_data.json")
        .map_err(|e| format!("open store failed: {}", e))?;
    store.set(
        "window_size",
        serde_json::json!({
            "width_px": width_px,
            "height_px": height_px,
        }),
    );
    store
        .save()
        .map_err(|e| format!("store save failed: {}", e))
}

fn restore_window_size(win: &WebviewWindow) -> Result<(), String> {
    let app = win.app_handle();
    let store = app
        .store("app_data.json")
        .map_err(|e| format!("open store failed: {}", e))?;

    let saved: Option<serde_json::Value> = store.get("window_size");

    if saved.is_none() {
        return Ok(());
    }

    let v = saved.unwrap();

    // 获取缩放比,缩放比 = 物理像素 / 逻辑像素
    let factor = win
        .scale_factor()
        .map_err(|e| format!("scale_factor failed: {}", e))? as f64;

    // 优先使用物理像素
    let (width_logical, height_logical) = if let (Some(wpx), Some(hpx)) = (
        v.get("width_px").and_then(|x| x.as_f64()),
        v.get("height_px").and_then(|x| x.as_f64()),
    ) {
        // 物理值换回逻辑值
        (wpx / factor, hpx / factor)
    } else if let (Some(wl), Some(hl)) = (
        v.get("width").and_then(|x| x.as_f64()),
        v.get("height").and_then(|x| x.as_f64()),
    ) {
        (wl, hl)
    } else {
        return Ok(());
    };

    // 避免设置到 0 或负数
    let w = width_logical.max(1.0);
    let h = height_logical.max(1.0);

    // set_size 存储的是 逻辑尺寸(DPI)
    win.set_size(tauri::Size::Logical(LogicalSize::new(w, h)))
        .map_err(|e| format!("set_size failed: {}", e))
}
