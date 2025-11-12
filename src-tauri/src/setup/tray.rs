use log::{error, info};
use std::error::Error;
use tauri::{image::Image, menu::Menu, tray::TrayIconBuilder, App, Runtime};

/// 从字节数据创建 Tauri Image（直接使用原始图像）
/// 仅在 macOS 平台下使用
#[cfg(target_os = "macos")]
fn create_image_from_bytes(icon_bytes: &[u8], platform: &str) -> Option<Image<'static>> {
    match image::load_from_memory(icon_bytes) {
        Ok(img) => {
            let rgba_img = img.to_rgba8();
            let (width, height) = rgba_img.dimensions();
            let image = Image::new_owned(rgba_img.into_raw(), width, height);
            info!(
                "Loaded custom tray icon for {} ({}x{})",
                platform, width, height
            );
            Some(image)
        }
        Err(_e) => None,
    }
}

/// 加载自定义托盘图标（仅 macOS）
fn load_custom_tray_icon() -> Option<Image<'static>> {
    #[cfg(target_os = "macos")]
    {
        let icon_bytes = include_bytes!("../../icons/tray-mac.png");
        create_image_from_bytes(icon_bytes, "macOS")
    }

    #[cfg(not(target_os = "macos"))]
    {
        // 非 macOS 平台不加载自定义图标
        None
    }
}

/// 创建系统托盘
pub fn setup_tray<R: Runtime>(menu: &Menu<R>, app: &App<R>) -> Result<(), Box<dyn Error>> {
    // 尝试加载自定义托盘图标，如果失败则使用默认图标
    let icon = load_custom_tray_icon().unwrap_or_else(|| {
        info!("Using default window icon for tray");
        app.default_window_icon()
            .ok_or("Failed to get default window icon")
            .unwrap()
            .clone()
    });

    let tray_result = TrayIconBuilder::new()
        .menu(menu)
        .show_menu_on_left_click(true)
        .icon(icon)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            other => println!("menu item {} not handled", other),
        })
        .build(app);

    match tray_result {
        Ok(_) => {
            info!("System tray created successfully!");
            Ok(())
        }
        Err(e) => {
            error!("Failed to create system tray: {}", e);
            Err(Box::new(e))
        }
    }
}
