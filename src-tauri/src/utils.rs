use crate::commands::requests::ApiResponse;
use anyhow::Result;
use chrono::{Local, Offset};
use log::{error, warn};
use tauri::{AppHandle, LogicalSize, Manager, WebviewWindow};
use tauri_plugin_store::StoreExt;
use url::Url;

/// 判断是否为 OAuth 回调 deeplink
pub fn is_auth_callback(raw_url: &str) -> bool {
    if let Ok(url) = Url::parse(raw_url) {
        return url.scheme() == "jms"
            && url
                .host_str()
                .map(|h| h.eq_ignore_ascii_case("auth"))
                .unwrap_or(false)
            && url.path().starts_with("/callback");
    }
    false
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

    // 限制窗口尺寸：宽度 600-1800，高度 400-1000
    let w = width_logical.max(600.0).min(1800.0);
    let h = height_logical.max(400.0).min(1000.0);

    win.set_size(tauri::Size::Logical(LogicalSize::new(w, h)))
        .map_err(|e| format!("set_size failed: {}", e))?;

    let _ = save_window_logical_size(&app, w, h);

    Ok(())
}
