mod api;
mod commands;
mod http;
mod service;
mod setup;
mod utils;

use crate::setup::apply_window_effects;
use crate::setup::menu::{build_menu, handle_menu_event};
use crate::setup::setup_tray;

use crate::api::session::ApiSessionStore;
use crate::commands::api_session::{set_api_org, set_api_session};
use crate::commands::asset_detail::get_asset_detail;
use crate::commands::asset_favorite::set_favorite;
use crate::commands::asset_rename::rename;
use crate::commands::asset_unfavorite::unfavorite;
use crate::commands::assets::get_assets;
use crate::commands::auth::{auth_cancel, auth_login, handle_auth_callback, AuthFlowState};
use crate::commands::client_launcher::pull_up;
use crate::commands::config::get_config;
use crate::commands::config_update::update_config_selection;
use crate::commands::connect_methods::get_connect_methods;
use crate::commands::connect_token::get_connect_token;
use crate::commands::dev_http_server::init_http_callback_server;
use crate::commands::logout::logout;
use crate::commands::setting::get_setting;
use crate::commands::system_fonts::list_system_fonts;
use crate::commands::version::get_version_message;
use crate::commands::window::{close_window, minimize_window, toggle_maximize_window};
use crate::utils::is_auth_callback;

use log::{error, info, warn};
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_single_instance::init as single_instance;

fn raise_main_window_for_auth(handle: &tauri::AppHandle) {
    let Some(win) = handle.get_webview_window("main") else {
        warn!("main window not found, cannot raise for auth callback");
        return;
    };

    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();

    let was_always_on_top = win.is_always_on_top().unwrap_or(false);
    if let Err(e) = win.set_always_on_top(true) {
        warn!("Failed to set main window always on top: {}", e);
        return;
    }

    if !was_always_on_top {
        let app_handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            if let Some(win) = app_handle.get_webview_window("main") {
                let _ = win.set_always_on_top(false);
            }
        });
    }
}

fn process_deep_link(handle: &tauri::AppHandle, raw: &str) -> bool {
    info!("deep link received: {}", raw);

    if is_auth_callback(raw) {
        info!("deep link is auth callback, handling in current instance");
        raise_main_window_for_auth(handle);
        let flow_state = handle.state::<AuthFlowState>();
        handle_auth_callback(&flow_state, raw);
        return false;
    }

    match pull_up(handle.clone(), raw.to_string()) {
        Ok(_) => {
            info!("deep link pull_up succeeded");
            true
        }
        Err(e) => {
            error!("deep link pull_up failed: {}", e);
            false
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(AuthFlowState::default())
        .manage(ApiSessionStore::default())
        .plugin(single_instance(|app, argv, _cwd| {
            info!("single_instance event, argv={:?}", argv);

            for arg in argv {
                if arg.starts_with("jms://") {
                    let did_pull_up = process_deep_link(app, &arg);
                    info!(
                        "single_instance processed deep link, did_pull_up={}",
                        did_pull_up
                    );
                } else {
                    warn!("single_instance ignored non-deeplink arg: {}", arg);
                }
            }
        }))
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
        .plugin(tauri_plugin_prevent_default::debug())
        .setup(|app| {
            let menu = build_menu(app)?;
            app.set_menu(menu.clone())?;
            app.on_menu_event(|app_handle, event| handle_menu_event(&app_handle, &event));

            let win = app.get_webview_window("main").unwrap();
            let app_handle = app.app_handle().clone();

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
                    let _ = process_deep_link(&app_handle, url.as_str());
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
            auth_cancel,
            get_assets,
            get_config,
            get_setting,
            set_favorite,
            close_window,
            minimize_window,
            get_asset_detail,
            get_connect_token,
            get_version_message,
            list_system_fonts,
            toggle_maximize_window,
            update_config_selection,
            init_http_callback_server,
            get_connect_methods,
            set_api_session,
            set_api_org,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
