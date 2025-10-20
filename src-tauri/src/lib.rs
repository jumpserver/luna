mod commands;
mod models;
mod service;
mod setup;
mod utils;

use crate::setup::apply_window_effects;
use crate::setup::setup_tray;

use crate::commands::get_asset_detail::get_asset_detail;
use crate::commands::get_assets::get_assets;
use crate::commands::get_config::get_config;
use crate::commands::get_setting::get_setting;
use crate::commands::get_token::get_connect_token;
use crate::commands::logout::logout;
use crate::commands::pull_up::pull_up;
use crate::commands::set_favorite::set_favorite;
use crate::commands::update_config::update_config_selection;
use crate::commands::url_watcher::url_watcher;
use crate::commands::window_controls::{minimize_window, toggle_maximize_window, close_window};

use log::error;
use tauri::menu::{Menu, MenuItem};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;
            let win = app.get_webview_window("main").unwrap();

            // 创建系统托盘
            setup_tray(&menu, &app)?;

            // 动态设置窗口装饰为 false，确保标题栏被隐藏
            if let Err(e) = win.set_decorations(false) {
                error!("Failed to set window decorations: {}", e);
            }

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
        .plugin(tauri_plugin_window_state::Builder::default()
            .with_state_flags(tauri_plugin_window_state::StateFlags::all().difference(tauri_plugin_window_state::StateFlags::DECORATIONS))
            .build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            logout,
            pull_up,
            get_assets,
            get_config,
            url_watcher,
            get_setting,
            set_favorite,
            get_asset_detail,
            get_connect_token,
            update_config_selection,
            minimize_window,
            toggle_maximize_window,
            close_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
