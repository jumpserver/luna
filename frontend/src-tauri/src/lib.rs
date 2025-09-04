mod commands;
mod models;
mod setup;

mod utils;

use crate::commands::{
    custom_http_request, debug_get_cookies, start_cookie_watcher, start_url_watcher,
};
use crate::setup::apply_window_effects;
use crate::setup::setup_tray;

use log::error;
use tauri::menu::{Menu, MenuItem};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
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
        .invoke_handler(tauri::generate_handler![
            start_cookie_watcher,
            start_url_watcher,
            custom_http_request,
            debug_get_cookies
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
