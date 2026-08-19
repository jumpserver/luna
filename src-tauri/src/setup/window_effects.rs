use crate::utils::setup_window_size_persistence;
use log::{error, info};
use std::error::Error;
use tauri::WebviewWindow;

#[cfg(target_os = "macos")]
// Keep this in sync with Workspace/topHeader.vue's h-10.
const HEADER_HEIGHT: f64 = 40.0;
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_LEFT: f64 = 10.0;

#[cfg(target_os = "macos")]
fn position_mac_traffic_lights(win: &WebviewWindow) -> Result<(), Box<dyn Error>> {
    use objc2_app_kit::{NSWindow, NSWindowButton};

    let ns_window = unsafe { &*win.ns_window()?.cast::<NSWindow>() };
    let close = ns_window
        .standardWindowButton(NSWindowButton::CloseButton)
        .ok_or("macOS close button not found")?;
    let minimize = ns_window
        .standardWindowButton(NSWindowButton::MiniaturizeButton)
        .ok_or("macOS minimize button not found")?;
    let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton);
    let title_bar = unsafe { close.superview().and_then(|view| view.superview()) }
        .ok_or("macOS title bar view not found")?;

    let mut title_bar_frame = title_bar.frame();
    title_bar_frame.size.height = HEADER_HEIGHT;
    title_bar_frame.origin.y = ns_window.frame().size.height - HEADER_HEIGHT;
    title_bar.setFrame(title_bar_frame);

    let close_frame = close.frame();
    let spacing = minimize.frame().origin.x - close_frame.origin.x;
    for (index, button) in [Some(close), Some(minimize), zoom]
        .into_iter()
        .flatten()
        .enumerate()
    {
        let mut origin = button.frame().origin;
        origin.x = TRAFFIC_LIGHT_LEFT + index as f64 * spacing;
        origin.y = (HEADER_HEIGHT - button.frame().size.height) / 2.0;
        button.setFrameOrigin(origin);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn setup_mac_traffic_lights(win: &WebviewWindow) {
    if let Err(e) = position_mac_traffic_lights(win) {
        error!("Failed to position macOS traffic lights: {}", e);
    }

    let win_for_events = win.clone();
    win.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::ScaleFactorChanged { .. }) {
            if let Err(e) = position_mac_traffic_lights(&win_for_events) {
                error!("Failed to reposition macOS traffic lights: {}", e);
            }
        }
    });
}

/// 为 macOS 窗口应用毛玻璃效果
#[cfg(target_os = "macos")]
pub fn apply_mac_vibrancy(win: &WebviewWindow) -> Result<(), Box<dyn Error>> {
    use window_vibrancy::NSVisualEffectMaterial;
    let show_vibrancy =
        window_vibrancy::apply_vibrancy(&win, NSVisualEffectMaterial::FullScreenUI, None, None);

    setup_mac_traffic_lights(win);

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

    if let Err(e) = _win.set_shadow(false) {
        error!("Failed to set window shadow: {}", e);
    }
    Ok(())
}

/// 为 Linux 窗口保留原生标题栏，使用桌面环境自己的窗口按钮
#[cfg(target_os = "linux")]
pub fn apply_linux_window(win: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    info!("Keeping Linux native window decorations enabled");
    if let Err(e) = win.set_decorations(true) {
        error!("Failed to enable Linux window decorations: {}", e);
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
