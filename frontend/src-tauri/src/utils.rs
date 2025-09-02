use log::{info, warn};
use tauri::{AppHandle, Manager, WebviewWindow};
use url::Url;
use tokio::time::{sleep, Duration};
use crate::models::CookieMessage;

/// 获取窗口 cookies
pub async fn get_window_cookies(app: &AppHandle, window_label: &str, origin: &str) -> Result<Vec<CookieMessage>, String> {
    // 等待窗口可用，最多重试 10 次
    let win = get_window_with_retry(app, window_label, 10).await
        .ok_or_else(|| format!("window '{}' not found after retries", window_label))?;
    let url = Url::parse(origin).map_err(|e| e.to_string())?;

    let cookies = win.cookies_for_url(url).map_err(|e| e.to_string())?;

    let cookie_list = cookies.into_iter().map(
        |cookie| CookieMessage {
            name: cookie.name().to_string(),
            value: cookie.value().to_string(),
            domain: cookie.domain().unwrap_or_default().to_string(),
            path: cookie.path().unwrap_or("/").to_string(),
            secure: cookie.secure().unwrap_or(false),
            http_only: cookie.http_only().unwrap_or(false),
        }
    ).collect();

    Ok(cookie_list)
}

/// 比较两次抓到的 cookies 是否有任何变化：
/// - 数量不同 → 变化
/// - 逐项(按 domain/path/name 排序后) 有任意字段不同 → 变化
pub fn cookies_changed(prev: &[CookieMessage], curr: &[CookieMessage]) -> bool {
    if prev.len() != curr.len() {
        return true;
    }

    // 为了稳定比较，按 (domain, path, name) 排序后逐项对比
    let mut a = prev.to_vec();   // 需要 CookieMessage: Clone（常见 derive：Clone, Debug, PartialEq, Serialize）
    let mut b = curr.to_vec();

    a.sort_by(|x, y| {
        (
            x.domain.as_str(),
            x.path.as_str(),
            x.name.as_str(),
        )
            .cmp(&(
                y.domain.as_str(),
                y.path.as_str(),
                y.name.as_str(),
            ))
    });
    b.sort_by(|x, y| {
        (
            x.domain.as_str(),
            x.path.as_str(),
            x.name.as_str(),
        )
            .cmp(&(
                y.domain.as_str(),
                y.path.as_str(),
                y.name.as_str(),
            ))
    });

    // 字段逐项比较（不依赖具体 cookie 名称）
    for (x, y) in a.iter().zip(b.iter()) {
        if x.name != y.name
            || x.value != y.value
            || x.domain != y.domain
            || x.path != y.path
            || x.secure != y.secure
            || x.http_only != y.http_only
        {
            return true;
        }
    }
    false
}

/// 重试获取窗口
async fn get_window_with_retry(app: &AppHandle, window_label: &str, max_retries: u32) -> Option<WebviewWindow> {
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
    warn!("窗口 '{}' 在 {} 次重试后仍未找到", window_label, max_retries);
    None
}
