use log::warn;
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use tauri::LogicalPosition;

use super::consts::menu_labels;

/// 创建应用菜单
pub fn build_menu<R: Runtime>(app: &impl Manager<R>) -> tauri::Result<Menu<R>> {
    let use_zh = prefers_zh();
    let labels = menu_labels(use_zh);
    let about_i = MenuItem::with_id(app, "about", labels.about_label, true, None::<&str>)?;

    // 设置项
    let settings_i = MenuItem::with_id(
        app,
        "open-settings",
        labels.settings_label,
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let close_window_i = MenuItem::with_id(
        app,
        "close-window",
        labels.close_label,
        true,
        Some("CmdOrCtrl+W"),
    )?;
    let minimize_window_i: MenuItem<R> = MenuItem::with_id(
        app,
        "minimize-window",
        labels.minimize_label,
        true,
        Some("CmdOrCtrl+M"),
    )?;

    let hide_i = MenuItem::with_id(app, "hide", labels.hide_label, true, Some("CmdOrCtrl+H"))?;
    let hide_others_i = MenuItem::with_id(
        app,
        "hide-others",
        labels.hide_others_label,
        true,
        Some("CmdOrCtrl+Alt+H"),
    )?;
    let show_all_i = MenuItem::with_id(app, "show-all", labels.show_all_label, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", labels.quit_label, true, Some("CmdOrCtrl+Q"))?;

    let app_menu = Submenu::with_items(
        app,
        "JumpServerClient",
        true,
        &[
            &about_i,
            &PredefinedMenuItem::separator(app)?,
            &settings_i,
            &close_window_i,
            &minimize_window_i,
            &PredefinedMenuItem::separator(app)?,
            &hide_i,
            &hide_others_i,
            &show_all_i,
            &PredefinedMenuItem::separator(app)?,
            &quit_i,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        labels.edit_label,
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(labels.undo_label))?,
            &PredefinedMenuItem::redo(app, Some(labels.redo_label))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(labels.cut_label))?,
            &PredefinedMenuItem::copy(app, Some(labels.copy_label))?,
            &PredefinedMenuItem::paste(app, Some(labels.paste_label))?,
            &PredefinedMenuItem::select_all(app, Some(labels.select_all_label))?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &edit_menu])
}

/// 菜单事件处理
pub fn handle_menu_event(app_handle: &tauri::AppHandle, event: &MenuEvent) {
    match event.id().as_ref() {
        "open-settings" => {
            open_settings_window(app_handle);
        }
        "about" => open_about_window(app_handle),
        "close-window" => {
            if let Some(win) = app_handle.get_focused_window() {
                let _ = win.close();
            }
        }
        "minimize-window" => {
            if let Some(win) = app_handle.get_focused_window() {
                let _ = win.minimize();
            }
        }
        "hide" => {
            #[cfg(target_os = "macos")]
            {
                let _ = app_handle.hide();
            }
            #[cfg(not(target_os = "macos"))]
            {
                for (_, win) in app_handle.webview_windows() {
                    let _ = win.hide();
                }
            }
        }
        "hide-others" => {
            if let Some(current) = app_handle.get_focused_window() {
                let current_label = current.label().to_string();
                for (label, win) in app_handle.webview_windows() {
                    if label != current_label {
                        let _ = win.hide();
                    }
                }
            }
        }
        "show-all" => {
            for (_, win) in app_handle.webview_windows() {
                let _ = win.show();
            }
        }
        "quit" => app_handle.exit(0),
        _ => warn!("unhandled menu id: {:?}", event.id()),
    }
}

/// 打开/聚焦设置窗口
pub fn open_settings_window(app: &tauri::AppHandle) {
    let label = "secondary";

    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return;
    }

    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("/setting".into()))
        .title("Connection Settings")
        .min_inner_size(930.0, 520.0)
        .max_inner_size(930.0, 675.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .traffic_light_position(LogicalPosition::new(10.0, 22.0));
    }

    let _ = builder.build();
}

/// 打开 About 弹窗
fn open_about_window(app: &tauri::AppHandle) {
    let label = "about-window";
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("/about.html".into()))
        .title("About")
        .inner_size(320.0, 250.0)
        .resizable(false)
        .title_bar_style(tauri::TitleBarStyle::Visible);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .traffic_light_position(LogicalPosition::new(12.0, 12.0));
    }

    let _ = builder.build();
}

/// 获取系统语言
fn prefers_zh() -> bool {
    tauri_plugin_os::locale()
        .or_else(|| std::env::var("LANG").ok())
        .map(|lang| lang.to_lowercase().starts_with("zh"))
        .unwrap_or(false)
}
