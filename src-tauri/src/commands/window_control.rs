use tauri::{command, AppHandle, WebviewWindow};

/// 打开或聚焦设置窗口
#[command]
pub fn open_settings_window(app: AppHandle) {
    crate::setup::menu::open_settings_window(&app);
}

/// 最小化窗口
#[command]
pub async fn minimize_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// 最大化/还原窗口
#[command]
pub async fn toggle_maximize_window(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

/// 关闭窗口
#[command]
pub async fn close_window(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}
