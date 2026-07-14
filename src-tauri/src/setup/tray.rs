use log::{error, info};
use std::error::Error;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Manager, Runtime,
};

use super::consts::menu_labels;
use super::menu::{open_about_window, open_settings_window};

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

fn prefers_zh() -> bool {
    tauri_plugin_os::locale()
        .or_else(|| std::env::var("LANG").ok())
        .map(|lang| lang.to_lowercase().starts_with("zh"))
        .unwrap_or(false)
}

fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let labels = menu_labels(prefers_zh(), &app.package_info().name);
    let show_i = MenuItem::with_id(
        app,
        "show-main",
        if prefers_zh() {
            "显示主窗口"
        } else {
            "Show Main Window"
        },
        true,
        None::<&str>,
    )?;
    let settings_i = MenuItem::with_id(
        app,
        "open-settings",
        labels.settings_label.as_str(),
        true,
        None::<&str>,
    )?;
    let about_i = MenuItem::with_id(
        app,
        "about",
        labels.about_label.as_str(),
        true,
        None::<&str>,
    )?;
    let quit_i = MenuItem::with_id(
        app,
        "quit",
        labels.quit_label.as_str(),
        true,
        None::<&str>,
    )?;

    Menu::with_items(
        app,
        &[
            &show_i,
            &settings_i,
            &about_i,
            &PredefinedMenuItem::separator(app)?,
            &quit_i,
        ],
    )
}

/// 创建系统托盘
pub fn setup_tray<R: Runtime>(_: &Menu<R>, app: &App<R>) -> Result<(), Box<dyn Error>>
where
    App<R>: Manager<R>,
    AppHandle<R>: Manager<R>,
{
    // 尝试加载自定义托盘图标，如果失败则使用默认图标
    let icon = load_custom_tray_icon().unwrap_or_else(|| {
        info!("Using default window icon for tray");
        app.default_window_icon()
            .ok_or("Failed to get default window icon")
            .unwrap()
            .clone()
    });

    let app_handle = app.app_handle().clone();
    let tray_menu = build_tray_menu(&app_handle)?;

    let tray_result = TrayIconBuilder::new()
        .menu(&tray_menu)
        .show_menu_on_left_click(true)
        .icon(icon)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-main" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "open-settings" => open_settings_window(app),
            "about" => open_about_window(app),
            "quit" => app.exit(0),
            other => println!("menu item {} not handled", other),
        })
        .build(app);

    match tray_result {
        Ok(_tray) => {
            // 在 macOS 上将图标设置为模板图像，以便系统可以根据菜单栏背景自动调整颜色
            #[cfg(target_os = "macos")]
            {
                if let Err(e) = _tray.set_icon_as_template(true) {
                    error!("Failed to set tray icon as template: {}", e);
                } else {
                    info!("Tray icon set as template for macOS");
                }
            }
            info!("System tray created successfully!");
            Ok(())
        }
        Err(e) => {
            error!("Failed to create system tray: {}", e);
            Err(Box::new(e))
        }
    }
}
