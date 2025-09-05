mod commands;
mod models;
mod setup;
mod utils;

use crate::setup::apply_window_effects;
use crate::setup::setup_tray;

use crate::commands::url_watcher::url_watcher;
use log::error;
use tauri::menu::{Menu, MenuItem};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;
            let win = app.get_webview_window("main").unwrap();

            // 创建系统托盘
            setup_tray(&menu, &app)?;

            if let Err(e) = apply_window_effects(&win) {
                error!("Failed to apply window effects: {}", e);
            }

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![url_watcher])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
