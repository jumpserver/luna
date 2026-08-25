mod api;
mod commands;
mod http;
mod offline;
mod service;
mod setup;
mod ssh_helper;
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
use crate::commands::local_ai_cli::{
    generate_local_ai_command, has_local_ai_provider_api_key, list_local_ai_clis,
    set_local_ai_provider_api_key,
};
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
use crate::commands::web_proxy::{
    close_web_proxy_view, create_web_proxy_view, history_web_proxy_view, navigate_web_proxy_view,
    reload_web_proxy_view, set_web_proxy_view_active, set_web_proxy_view_bounds,
    start_web_proxy_recording, stop_web_proxy_recording,
};
use crate::commands::web_proxy_recording::WebProxyRecordingManager;
use crate::commands::window_control::{
    close_window, minimize_window, open_settings_window, toggle_maximize_window,
};
use crate::offline::storage::OfflineStorage;
use crate::service::oauth::AuthFlowState;
use crate::transcode::transcode_replays;
use crate::utils::is_auth_callback;

use log::{error, info, warn};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{Manager, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
#[cfg(not(target_os = "macos"))]
use tauri_plugin_single_instance::init as single_instance;

pub fn run_ssh_helper_if_requested() -> bool {
    ssh_helper::run_if_requested()
}

pub fn run_ssh_helper_standalone() -> ! {
    ssh_helper::run_standalone()
}

fn logger_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_log::fern::colors::{Color, ColoredLevelConfig};

    let crate_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };
    let colors = ColoredLevelConfig::new()
        .error(Color::Red)
        .warn(Color::Yellow)
        .info(Color::Green)
        .debug(Color::Cyan)
        .trace(Color::BrightBlack);

    tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .level_for("jumpserver_client_lib", crate_level)
        .level_for("tao", log::LevelFilter::Warn)
        .level_for("wry", log::LevelFilter::Warn)
        .level_for("webview", log::LevelFilter::Warn)
        .level_for("reqwest", log::LevelFilter::Warn)
        .level_for("hyper", log::LevelFilter::Warn)
        .max_file_size(500_000 /* bytes */)
        .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
        .clear_format()
        .clear_targets()
        .target(
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout).format(
                move |out, message, record| {
                    out.finish(format_args!(
                        "[{}][{}][{}] {}",
                        chrono::Local::now().format("%Y-%m-%d][%H:%M:%S"),
                        colors.color(record.level()),
                        record.target(),
                        message
                    ))
                },
            ),
        )
        .target(
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                file_name: Some("client_logs".to_string()),
            })
            .format(|out, message, record| {
                out.finish(format_args!(
                    "[{}][{}][{}] {}",
                    chrono::Local::now().format("%Y-%m-%d][%H:%M:%S"),
                    record.level(),
                    record.target(),
                    message
                ))
            }),
        )
        .build()
}

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
    if is_auth_callback(raw) {
        info!("deep link is auth callback, handling in current instance");
        raise_main_window_for_auth(handle);
        let flow_state = handle.state::<AuthFlowState>();
        flow_state.handle_callback(raw);
        return false;
    }

    info!("deep link received");

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
        .manage(WebProxyRecordingManager::default())
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
        .plugin(logger_plugin())
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
            let recording_manager = app.state::<WebProxyRecordingManager>().inner().clone();
            let recording_close_started = Arc::new(AtomicBool::new(false));
            let win_for_recordings = win.clone();
            let app_for_recordings = app_handle.clone();
            win.on_window_event(move |event| {
                let WindowEvent::CloseRequested { api, .. } = event else {
                    return;
                };
                if !recording_manager.has_sessions()
                    || recording_close_started.swap(true, Ordering::AcqRel)
                {
                    return;
                }
                api.prevent_close();
                let manager = recording_manager.clone();
                let app = app_for_recordings.clone();
                let window = win_for_recordings.clone();
                tauri::async_runtime::spawn(async move {
                    manager.finish_all(&app).await;
                    let _ = window.destroy();
                });
            });

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
            list_local_ai_clis,
            has_local_ai_provider_api_key,
            set_local_ai_provider_api_key,
            generate_local_ai_command,
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
            create_web_proxy_view,
            set_web_proxy_view_active,
            set_web_proxy_view_bounds,
            navigate_web_proxy_view,
            reload_web_proxy_view,
            history_web_proxy_view,
            start_web_proxy_recording,
            stop_web_proxy_recording,
            close_web_proxy_view,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
