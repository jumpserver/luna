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
use crate::commands::list_system_fonts::list_system_fonts;
use crate::commands::logout::logout;
use crate::commands::pull_up::pull_up;
use crate::commands::rename_asset::rename;
use crate::commands::set_favorite::set_favorite;
use crate::commands::unfavorite::unfavorite;
use crate::commands::update_config::update_config_selection;
use crate::commands::url_watcher::url_watcher;
use crate::commands::window_controls::{close_window, minimize_window, toggle_maximize_window};

use log::error;
use tauri::menu::{Menu, MenuItem};
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(500_000 /* bytes */)
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("client_logs".to_string()),
                    },
                ))
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all().difference(
                    tauri_plugin_window_state::StateFlags::DECORATIONS
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE,
                ))
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;
            let win = app.get_webview_window("main").unwrap();

            // 检查是否通过深度链接启动
            let start_urls = app.deep_link().get_current()?;
            if let Some(urls) = start_urls {
                // 处理启动时的深度链接
                for url in &urls {
                    error!("deep link original URL start_urls : {}", url.as_str());
                    pull_up(app.app_handle().clone(), url.as_str().to_string());
                }
                // 深度链接启动时，调用完 pull_up 后直接退出
                std::process::exit(0);
            }

            let app_handle = app.app_handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                for url in &urls {
                    error!("deep link original URL on_open_url: {}", url.as_str());
                    pull_up(app_handle.clone(), url.as_str().to_string());
                }
            });

            // 创建系统托盘
            setup_tray(&menu, &app)?;
            if let Err(e) = apply_window_effects(&win) {
                error!("Failed to apply window effects: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            logout,
            rename,
            pull_up,
            unfavorite,
            get_assets,
            get_config,
            url_watcher,
            get_setting,
            set_favorite,
            close_window,
            minimize_window,
            get_asset_detail,
            get_connect_token,
            list_system_fonts,
            toggle_maximize_window,
            update_config_selection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
