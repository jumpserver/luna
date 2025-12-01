use log::warn;
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{LogicalPosition, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

/// 创建应用菜单
pub fn build_menu<R: Runtime>(app: &impl Manager<R>) -> tauri::Result<Menu<R>> {
    let use_zh = prefers_zh();
    let about_label = if use_zh { "关于 JumpServerClient" } else { "About JumpServerClient" };
    let settings_label = if use_zh { "设置" } else { "Settings" };
    let close_label = if use_zh { "关闭窗口" } else { "Close Window" };
    let minimize_label = if use_zh { "最小化窗口" } else { "Minimize Window" };
    let hide_label = if use_zh { "隐藏 JumpServerClient" } else { "Hide JumpServerClient" };
    let hide_others_label = if use_zh { "隐藏 其他窗口" } else { "Hide Others" };
    let show_all_label = if use_zh { "显示所有窗口" } else { "Show All" };
    let quit_label = if use_zh { "退出" } else { "Quit" };

    let about_i = MenuItem::with_id(app, "about", about_label, true, None::<&str>)?;

    // 设置项
    let settings_i = MenuItem::with_id(
        app,
        "open-settings",
        settings_label,
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let close_window_i =
        MenuItem::with_id(app, "close-window", close_label, true, Some("CmdOrCtrl+W"))?;
    let minimize_window_i: MenuItem<R> = MenuItem::with_id(
        app,
        "minimize-window",
        minimize_label,
        true,
        Some("CmdOrCtrl+M"),
    )?;

    let hide_i = MenuItem::with_id(app, "hide", hide_label, true, Some("CmdOrCtrl+H"))?;
    let hide_others_i = MenuItem::with_id(
        app,
        "hide-others",
        hide_others_label,
        true,
        Some("CmdOrCtrl+Alt+H"),
    )?;
    let show_all_i = MenuItem::with_id(app, "show-all", show_all_label, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", quit_label, true, Some("CmdOrCtrl+Q"))?;
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

    Menu::with_items(app, &[&app_menu])
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
            let _ = app_handle.hide();
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

    let _ = WebviewWindowBuilder::new(app, label, WebviewUrl::App("/setting".into()))
        .title("Connection Settings")
        .min_inner_size(930.0, 520.0)
        .max_inner_size(930.0, 675.0)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .traffic_light_position(LogicalPosition::new(10.0, 22.0))
        .build();
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

    let _ = WebviewWindowBuilder::new(app, label, WebviewUrl::App("/about.html".into()))
        .title("About")
        .inner_size(320.0, 250.0)
        .resizable(false)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Visible)
        .traffic_light_position(LogicalPosition::new(12.0, 12.0))
        .build();
}

/// 获取系统语言
fn prefers_zh() -> bool {
    tauri_plugin_os::locale()
        .or_else(|| std::env::var("LANG").ok())
        .map(|lang| lang.to_lowercase().starts_with("zh"))
        .unwrap_or(false)
}
