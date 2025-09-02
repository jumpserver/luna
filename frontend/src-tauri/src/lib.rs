mod commands;
mod models;
mod utils;

use crate::commands::start_cookie_watcher;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_fs::FsExt;
use window_vibrancy::{self, NSVisualEffectMaterial};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;
            let win = app.get_webview_window("main").unwrap();

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    other => println!("menu item {} not handled", other),
                })
                .build(app)?;

            #[cfg(target_os = "macos")]
            window_vibrancy::apply_vibrancy(&win, NSVisualEffectMaterial::FullScreenUI, None, None)
                .expect("Failed to apply vibrancy");
            #[cfg(target_os = "windows")]
            window_vibrancy::apply_blur(&win, Some((18, 18, 18, 125)))
                .expect("Failed to apply blur");

            let current_dir = std::env::current_dir().unwrap();
            let project_root = current_dir.parent().unwrap();
            let project_root_canonical = project_root.canonicalize().unwrap();

            let scope = app.fs_scope();
            scope.allow_directory(&project_root_canonical, true)?;
            let config_file_path = project_root_canonical.join("config.json");
            scope.allow_file(&config_file_path)?;

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![start_cookie_watcher])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
