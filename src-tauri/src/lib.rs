mod api;
mod commands;
mod http;
mod offline;
mod service;
mod setup;
mod transcode;
mod utils;

use crate::setup::apply_window_effects;
use crate::setup::menu::{build_menu, handle_menu_event};
use crate::setup::setup_tray;

use crate::api::session::ApiSessionStore;
use crate::commands::api_request::api_request;
use crate::commands::api_session::{set_api_org, set_api_session};
use crate::commands::auth_flow::{auth_cancel, auth_login, bootstrap_auth_session};
use crate::commands::auth_logout::logout;
use crate::commands::client_launcher::pull_up;
use crate::commands::config_update::update_config_selection;
use crate::commands::connect_token::{
    create_koko_connect_ticket, get_builtin_connect_session, get_connect_token,
};
use crate::commands::dev_http_server::init_http_callback_server;
use crate::commands::get_config::get_config;
use crate::commands::get_version::get_version_message;
use crate::commands::local_shell::{
    close_local_shell, resize_local_shell, start_local_shell, write_local_shell, LocalShellState,
};
use crate::commands::offline_player::{
    get_offline_entry_url, import_offline_recording, list_offline_recordings,
    remove_offline_recording,
};
use crate::commands::plugin_manager::{
    create_custom_terminal, install_plugin, list_plugins, uninstall_plugin,
};
use crate::commands::system_fonts::list_system_fonts;
use crate::commands::window_control::{
    close_window, minimize_window, open_settings_window, toggle_maximize_window,
};
use crate::offline::storage::OfflineStorage;
use crate::service::oauth::AuthFlowState;
use crate::transcode::transcode_replays;
use crate::utils::is_auth_callback;

use log::{error, info, warn};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
#[cfg(not(target_os = "macos"))]
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
        flow_state.handle_callback(raw);
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
    let builder = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("offline", |context, request, responder| {
            let app = context.app_handle().clone();

            // custom protocol 的文件读取不能阻塞 WebView/UI 线程。
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(crate::offline::protocol::handle_request(&app, request));
            });
        })
        .manage(AuthFlowState::default())
        .manage(ApiSessionStore::default())
        .manage(LocalShellState::default());

    // macOS delivers custom URL schemes through RunEvent::Opened. Registering
    // the single-instance plugin there consumes the second launch before that
    // event reaches the deep-link plugin, dropping the jms2:// URL. AppKit
    // already routes opens to the running application, so only Windows/Linux
    // need the explicit single-instance bridge.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.plugin(single_instance(|app, argv, _cwd| {
        info!("single_instance event, argv={:?}", argv);

        for arg in argv {
            if arg.starts_with("jms2://") {
                let did_pull_up = process_deep_link(app, &arg);
                info!(
                    "single_instance processed deep link, did_pull_up={}",
                    did_pull_up
                );
            } else {
                warn!("single_instance ignored non-deeplink arg: {}", arg);
            }
        }
    }));

    builder
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
            let offline_root = app.path().app_data_dir()?.join("offline-recordings");
            let offline_storage = OfflineStorage::open(offline_root)?;

            // 上次异常退出可能留下 .pending-* 目录。
            // 只清理超过一天的目录，避免影响仍在进行的导入。
            if let Err(error) = offline_storage.cleanup_stale(Duration::from_secs(24 * 60 * 60)) {
                warn!("Failed to clean stale offline recordings: {error}");
            }
            app.manage(offline_storage);

            let menu = build_menu(app)?;
            #[cfg(target_os = "macos")]
            {
                app.set_menu(menu.clone())?;
                app.on_menu_event(|app_handle, event| handle_menu_event(&app_handle, &event));
            }

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
            api_request,
            pull_up,
            auth_login,
            auth_cancel,
            bootstrap_auth_session,
            get_config,
            close_window,
            minimize_window,
            open_settings_window,
            get_connect_token,
            get_builtin_connect_session,
            create_koko_connect_ticket,
            get_version_message,
            start_local_shell,
            write_local_shell,
            resize_local_shell,
            close_local_shell,
            list_system_fonts,
            toggle_maximize_window,
            update_config_selection,
            init_http_callback_server,
            set_api_session,
            set_api_org,
            import_offline_recording,
            list_offline_recordings,
            remove_offline_recording,
            get_offline_entry_url,
            transcode_replays,
            list_plugins,
            install_plugin,
            uninstall_plugin,
            create_custom_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
