use crate::utils::setup_window_size_persistence;
use log::{error, info};
use std::error::Error;
use tauri::WebviewWindow;

/// 为 macOS 窗口应用毛玻璃效果
#[cfg(target_os = "macos")]
pub fn apply_mac_vibrancy(win: &WebviewWindow) -> Result<(), Box<dyn Error>> {
    use window_vibrancy::NSVisualEffectMaterial;
    let show_vibrancy =
        window_vibrancy::apply_vibrancy(&win, NSVisualEffectMaterial::FullScreenUI, None, None);

    if let Err(e) = win.set_title("") {
        error!("Failed to set window title: {}", e);
    }
    match show_vibrancy {
        Ok(_) => {
            info!("Vibrancy applied successfully!");
            Ok(())
        }
        Err(e) => {
            error!("Failed to apply vibrancy: {}", e);
            Err(Box::new(e))
        }
    }
}

/// 为 Windows 窗口应用模糊效果
#[cfg(target_os = "windows")]
pub fn apply_windows_blur(_win: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    // Windows 下禁用模糊效果以避免边框问题
    info!("Windows blur effect disabled to avoid border issues");

    if let Err(e) = _win.set_decorations(false) {
        error!("Failed to set window decorations: {}", e);
    }
    Ok(())
}

/// 为 Linux 窗口隐藏原生标题栏
#[cfg(target_os = "linux")]
pub fn apply_linux_window(win: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    info!("Disabling Linux window decorations for custom header");
    if let Err(e) = win.set_decorations(false) {
        error!("Failed to set window decorations: {}", e);
    }
    Ok(())
}

/// 根据操作系统应用相应的窗口效果
pub fn apply_window_effects(win: &WebviewWindow) -> Result<(), Box<dyn Error>> {
    // 平台特定特效
    let result: Result<(), Box<dyn Error>> = {
        #[cfg(target_os = "macos")]
        {
            apply_mac_vibrancy(win)
        }
        #[cfg(target_os = "windows")]
        {
            apply_windows_blur(win)
        }
        #[cfg(target_os = "linux")]
        {
            apply_linux_window(win)
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            info!("Window effects not supported on this platform");
            Ok(())
        }
    };

    // 窗口尺寸持久化逻辑
    setup_window_size_persistence(win.clone());

    result
}
