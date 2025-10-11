use log::{error, info};
use std::error::Error;
use tauri::{menu::Menu, tray::TrayIconBuilder, App, Runtime};

/// 创建系统托盘
pub fn setup_tray<R: Runtime>(menu: &Menu<R>, app: &App<R>) -> Result<(), Box<dyn Error>> {
    let tray_result = TrayIconBuilder::new()
        .menu(menu)
        .show_menu_on_left_click(true)
        .icon(app.default_window_icon().unwrap().clone())
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
