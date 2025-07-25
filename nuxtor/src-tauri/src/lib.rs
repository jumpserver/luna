#[cfg_attr(mobile, tauri::mobile_entry_point)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
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
                    "quit" => {
                        app.exit(0);
                    }
                    other => {
                        println!("menu item {} not handled", other);
                    }
                })
                .build(app)?;

            // 仅在 mac 下
            #[cfg(target_os = "macos")]
            window_vibrancy::apply_vibrancy(&win, NSVisualEffectMaterial::FullScreenUI, None, None)
                .expect("Failed to apply vibrancy");

            #[cfg(target_os = "windows")]
            window_vibrancy::apply_blur(&win, Some((18, 18, 18, 125)))
                .expect("Failed to apply blur");

            // 获取主窗口并设置透明属性
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    // 保持阴影以获得更好的视觉效果
                    let _ = window.set_shadow(true);
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
