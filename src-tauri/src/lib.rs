mod commands;
mod service;
mod setup;
mod utils;

use crate::setup::apply_window_effects;
use crate::setup::menu::{build_menu, handle_menu_event};
use crate::setup::setup_tray;

use crate::commands::auth_login::{auth_login, handle_auth_callback, AuthFlowState};
use crate::commands::get_asset_detail::get_asset_detail;
use crate::commands::get_assets::get_assets;
use crate::commands::get_config::get_config;
use crate::commands::get_setting::get_setting;
use crate::commands::get_token::get_connect_token;
use crate::commands::http_callback::init_http_callback_server;
use crate::commands::list_system_fonts::list_system_fonts;
use crate::commands::logout::logout;
use crate::commands::pull_up::pull_up;
use crate::commands::rename_asset::rename;
use crate::commands::set_favorite::set_favorite;
use crate::commands::unfavorite::unfavorite;
use crate::commands::update_config::update_config_selection;
use crate::commands::window_controls::{close_window, minimize_window, toggle_maximize_window};
use crate::utils::is_auth_callback;

use log::{error, info};
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

pub fn run() {
    tauri::Builder::default()
        .manage(AuthFlowState::default())
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
        .plugin(tauri_plugin_opener::init())
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
            let menu = build_menu(app)?;
            app.set_menu(menu.clone())?;
            app.on_menu_event(|app_handle, event| handle_menu_event(&app_handle, &event));

            let win = app.get_webview_window("main").unwrap();
            let app_handle = app.app_handle().clone();

            // 公共处理逻辑：处理 deep link，返回是否执行了 pull_up
            let process_deep_link = |handle: &tauri::AppHandle, raw: &str| -> bool {
                error!("deep link original URL: {}", raw);

                if is_auth_callback(raw) {
                    let flow_state = handle.state::<AuthFlowState>();
                    handle_auth_callback(&flow_state, raw);
                    return false;
                }

                if let Err(e) = pull_up(handle.clone(), raw.to_string()) {
                    error!("Failed to pull up client: {}", e);
                    return false;
                }

                true
            };

            let start_urls = app.deep_link().get_current()?;

            // 处理冷启动时的深度链接
            if let Some(urls) = start_urls {
                let mut did_pull_up = false;

                for url in &urls {
                    did_pull_up |= process_deep_link(&app_handle, url.as_str());
                }
                
                // 深度链接启动时，调用完 pull_up 后直接退出
                if did_pull_up {
                    std::process::exit(0);
                }
            }

            app.deep_link().on_open_url(move |event| {
                info!("deep link event opened");
                let urls = event.urls();

                for url in &urls {
                    process_deep_link(&app_handle, url.as_str());
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
            auth_login,
            get_assets,
            get_config,
            get_setting,
            set_favorite,
            close_window,
            minimize_window,
            get_asset_detail,
            get_connect_token,
            list_system_fonts,
            toggle_maximize_window,
            update_config_selection,
            init_http_callback_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
