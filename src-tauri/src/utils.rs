use anyhow::Result;
use chrono::{Local, Offset};
use log::{error, warn};
use tauri::{AppHandle, LogicalSize, Manager, WebviewWindow};
use tauri_plugin_store::StoreExt;
use url::Url;

const DEFAULT_WINDOW_WIDTH: f64 = 1300.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 780.0;
const MIN_WINDOW_WIDTH: f64 = 600.0;
const MIN_WINDOW_HEIGHT: f64 = 400.0;
const MAX_WINDOW_WIDTH: f64 = 1800.0;
const MAX_WINDOW_HEIGHT: f64 = 1000.0;
const SCREEN_USAGE_RATIO: f64 = 0.9;
const WINDOW_SIZE_UNIT_LOGICAL: &str = "logical";

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

/// 初始化并持久化窗口尺寸（存逻辑尺寸 DIP），避免跨显示器缩放导致的视觉尺寸变化。
/// - 存储：逻辑像素宽高（width/height，DIP）
///
/// - 恢复：
///   直接按逻辑尺寸 set_size；若仅有旧的物理像素存档，则按当前缩放换算为逻辑尺寸后再设置。
///   Tauri/底层窗口系统会根据 当前屏幕的 scale factor，自动把逻辑尺寸换算成物理像素
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
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Resized(size) = event {
            // 跳过最小化/最大化状态下的尺寸变化，避免存入不合理的尺寸
            if win_for_events.is_minimized().ok().unwrap_or(false)
                || win_for_events.is_maximized().ok().unwrap_or(false)
            {
                return;
            }

            // 将事件给出的物理尺寸转换为逻辑尺寸：logical = physical / scale_factor
            let factor = win_for_events.scale_factor().ok().unwrap_or(1.0);
            let width_logical = (size.width as f64 / factor).max(1.0);
            let height_logical = (size.height as f64 / factor).max(1.0);

            if width_logical < MIN_WINDOW_WIDTH || height_logical < MIN_WINDOW_HEIGHT {
                return;
            }

            if let Err(e) = save_window_logical_size(&h, width_logical, height_logical) {
                error!("save_window_size (logical) failed: {}", e);
            }
        }
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
            "unit": WINDOW_SIZE_UNIT_LOGICAL,
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

    let Some(v) = store.get("window_size") else {
        return apply_window_size(win, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT);
    };

    let factor = win
        .scale_factor()
        .map_err(|e| format!("scale_factor failed: {}", e))?;

    let is_logical = v
        .get("unit")
        .and_then(|x| x.as_str())
        .is_some_and(|unit| unit == WINDOW_SIZE_UNIT_LOGICAL);

    let (width_logical, height_logical) = if let (Some(width), Some(height)) = (
        v.get("width").and_then(|x| x.as_f64()),
        v.get("height").and_then(|x| x.as_f64()),
    ) {
        if is_logical || (width <= MAX_WINDOW_WIDTH && height <= MAX_WINDOW_HEIGHT) {
            (width, height)
        } else {
            // 没有 unit 的旧数据可能把物理像素写在 width/height 里
            (width / factor, height / factor)
        }
    } else if let (Some(wpx), Some(hpx)) = (
        v.get("width_px").and_then(|x| x.as_f64()),
        v.get("height_px").and_then(|x| x.as_f64()),
    ) {
        // 从物理像素换算为逻辑尺寸
        (wpx / factor, hpx / factor)
    } else {
        return Ok(());
    };

    apply_window_size(win, width_logical, height_logical)?;

    Ok(())
}

fn apply_window_size(win: &WebviewWindow, width_logical: f64, height_logical: f64) -> Result<(), String> {
    let app: &AppHandle = win.app_handle();
    let (w, h) = fit_window_size_to_monitor(win, width_logical, height_logical);

    win.set_size(tauri::Size::Logical(LogicalSize::new(w, h)))
        .map_err(|e| format!("set_size failed: {}", e))?;

    let _ = save_window_logical_size(app, w, h);

    Ok(())
}

fn fit_window_size_to_monitor(win: &WebviewWindow, width_logical: f64, height_logical: f64) -> (f64, f64) {
    let base_w = width_logical.clamp(MIN_WINDOW_WIDTH, MAX_WINDOW_WIDTH);
    let base_h = height_logical.clamp(MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT);

    let Some(monitor) = win.current_monitor().ok().flatten() else {
        return (base_w, base_h);
    };

    let work_area = monitor.work_area();
    let factor = monitor.scale_factor().max(1.0);
    let max_w = ((work_area.size.width as f64 / factor) * SCREEN_USAGE_RATIO)
        .max(MIN_WINDOW_WIDTH)
        .min(MAX_WINDOW_WIDTH);
    let max_h = ((work_area.size.height as f64 / factor) * SCREEN_USAGE_RATIO)
        .max(MIN_WINDOW_HEIGHT)
        .min(MAX_WINDOW_HEIGHT);

    (base_w.min(max_w), base_h.min(max_h))
}
