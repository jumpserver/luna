use log::warn;
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use tauri::LogicalPosition;

use super::consts::menu_labels;

const DEFAULT_PRODUCT_NAME: &str = "JumpServerClient";

/// 创建应用菜单
pub fn build_menu<R: Runtime>(app: &impl Manager<R>) -> tauri::Result<Menu<R>> {
    let use_zh = prefers_zh();
    let app_name = app.package_info().name.clone();
    let labels = menu_labels(use_zh, &app_name);
    let about_i = MenuItem::with_id(
        app,
        "about",
        labels.about_label.as_str(),
        true,
        None::<&str>,
    )?;

    // 设置项
    let settings_i = MenuItem::with_id(
        app,
        "open-settings",
        labels.settings_label.as_str(),
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let close_window_i = MenuItem::with_id(
        app,
        "close-window",
        labels.close_label.as_str(),
        true,
        Some("CmdOrCtrl+W"),
    )?;
    let minimize_window_i: MenuItem<R> = MenuItem::with_id(
        app,
        "minimize-window",
        labels.minimize_label.as_str(),
        true,
        Some("CmdOrCtrl+M"),
    )?;

    let hide_i = MenuItem::with_id(
        app,
        "hide",
        labels.hide_label.as_str(),
        true,
        Some("CmdOrCtrl+H"),
    )?;
    let hide_others_i = MenuItem::with_id(
        app,
        "hide-others",
        labels.hide_others_label.as_str(),
        true,
        Some("CmdOrCtrl+Alt+H"),
    )?;
    let show_all_i = MenuItem::with_id(
        app,
        "show-all",
        labels.show_all_label.as_str(),
        true,
        None::<&str>,
    )?;
    let quit_i = MenuItem::with_id(
        app,
        "quit",
        labels.quit_label.as_str(),
        true,
        Some("CmdOrCtrl+Q"),
    )?;

    let app_menu = Submenu::with_items(
        app,
        app_name.as_str(),
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
        labels.edit_label.as_str(),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(labels.undo_label.as_str()))?,
            &PredefinedMenuItem::redo(app, Some(labels.redo_label.as_str()))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(labels.cut_label.as_str()))?,
            &PredefinedMenuItem::copy(app, Some(labels.copy_label.as_str()))?,
            &PredefinedMenuItem::paste(app, Some(labels.paste_label.as_str()))?,
            &PredefinedMenuItem::select_all(app, Some(labels.select_all_label.as_str()))?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        labels.file_label.as_str(),
        true,
        &[&PredefinedMenuItem::close_window(
            app,
            Some(labels.close_label.as_str()),
        )?],
    )?;
    let view_menu = Submenu::with_items(
        app,
        labels.view_label.as_str(),
        true,
        &[&PredefinedMenuItem::fullscreen(
            app,
            Some(labels.fullscreen_label.as_str()),
        )?],
    )?;
    let window_menu = Submenu::with_items(
        app,
        labels.window_label.as_str(),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(labels.minimize_label.as_str()))?,
            &PredefinedMenuItem::maximize(app, Some(labels.maximize_label.as_str()))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some(labels.close_label.as_str()))?,
        ],
    )?;
    let help_menu = Submenu::with_items(app, labels.help_label.as_str(), true, &[])?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
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

/// 在主窗口中打开设置页
pub fn open_settings_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    open_settings_window_at(app, None);
}

pub fn open_settings_window_at<R: Runtime>(app: &tauri::AppHandle<R>, path: Option<&str>) {
    let target = path
        .filter(|value| value.starts_with("/setting/"))
        .unwrap_or("/setting/general");

    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
        let _ = main.emit("settings-navigate", target);
    } else {
        warn!("main window not found, cannot open settings");
    }
}

/// 打开 About 弹窗
pub fn open_about_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    let label = "about-window";
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    let app_name = app.package_info().name.clone();
    let app_version = app.package_info().version.to_string();
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("name", &app_name)
        .append_pair("version", &app_version)
        .append_pair(
            "custom",
            if app_name == DEFAULT_PRODUCT_NAME {
                "0"
            } else {
                "1"
            },
        )
        .finish();
    let about_path = format!("/about.html?{query}");

    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(about_path.into()))
        .title("About")
        .inner_size(320.0, 300.0)
        .resizable(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Visible)
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
