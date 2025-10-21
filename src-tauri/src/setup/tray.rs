use log::{error, info};
use std::error::Error;
use tauri::{menu::Menu, tray::TrayIconBuilder, App, Runtime, image::Image};
use image::GenericImageView;

/// 从字节数据创建 Tauri Image（优化高分辨率处理）
fn create_image_from_bytes(icon_bytes: &[u8], platform: &str) -> Option<Image<'static>> {
    match image::load_from_memory(icon_bytes) {
        Ok(img) => {
            // 获取原始尺寸
            let (orig_width, orig_height) = img.dimensions();
            
            // 对于托盘图标，建议使用 32x32 或 64x64 的尺寸
            // 但保持原始高分辨率以确保质量
            let target_size = if orig_width >= 256 { 64 } else { 32 };
            
            let resized_img = if orig_width != target_size || orig_height != target_size {
                // 使用高质量重采样算法
                img.resize_exact(
                    target_size,
                    target_size,
                    image::imageops::FilterType::Lanczos3
                )
            } else {
                img
            };
            
            let rgba_img = resized_img.to_rgba8();
            let (width, height) = rgba_img.dimensions();
            let image = Image::new_owned(rgba_img.into_raw(), width, height);
            
            info!("Loaded custom tray icon for {} ({}x{} -> {}x{})", 
                  platform, orig_width, orig_height, width, height);
            Some(image)
        }
        Err(_e) => {
            None
        }
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
