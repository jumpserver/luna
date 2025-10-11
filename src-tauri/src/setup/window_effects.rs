use log::{error, info};
use std::error::Error;
use tauri::WebviewWindow;
use window_vibrancy::{self, NSVisualEffectMaterial};

/// 为 macOS 窗口应用毛玻璃效果
#[cfg(target_os = "macos")]
pub fn apply_mac_vibrancy(win: &WebviewWindow) -> Result<(), Box<dyn Error>> {
    let show_vibrancy =
        window_vibrancy::apply_vibrancy(&win, NSVisualEffectMaterial::FullScreenUI, None, None);

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
pub fn apply_windows_blur(win: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    match window_vibrancy::apply_blur(&win, Some((18, 18, 18, 125))) {
        Ok(_) => {
            info!("Window blur applied successfully!");
            Ok(())
        }
        Err(e) => {
            error!("Failed to apply window blur: {}", e);
            Err(Box::new(e))
        }
    }
}

/// 根据操作系统应用相应的窗口效果
pub fn apply_window_effects(win: &WebviewWindow) -> Result<(), Box<dyn Error>> {
    #[cfg(target_os = "macos")]
    {
        apply_mac_vibrancy(win)
    }

    #[cfg(target_os = "windows")]
    {
        apply_windows_blur(win)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        info!("Window effects not supported on this platform");
        Ok(())
    }
}
