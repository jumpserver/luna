#[cfg_attr(mobile, tauri::mobile_entry_point)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewWindow, AppHandle,
};
use serde::Serialize;
use tauri_plugin_fs::FsExt;
use url::Url;
use window_vibrancy::{self, NSVisualEffectMaterial};
use std::time::Duration;
use tokio::time::interval;

#[derive(Serialize, Clone, Debug, PartialEq)]
struct CookieKV {
    name: String,
    value: String,
    domain: String,
    path: String,
    secure: bool,
    http_only: bool,
}

// 检查是否有新的认证相关 cookies 出现（登录成功的标志）
fn has_new_auth_cookies(old_cookies: &[CookieKV], new_cookies: &[CookieKV]) -> bool {
    let auth_cookie_names = ["jms_sessionid", "jms_csrftoken", "X-JMS-ORG", "jms_public_key"];
    
    for name in &auth_cookie_names {
        let old_has_cookie = old_cookies.iter().any(|c| c.name == *name);
        let new_has_cookie = new_cookies.iter().any(|c| c.name == *name);
        
        // 如果之前没有这个认证 cookie，现在有了，说明登录成功
        if !old_has_cookie && new_has_cookie {
            println!("🎉 [Rust] 检测到新的认证 cookie '{}' - 登录成功！", name);
            return true;
        }
    }
    
    // 也可以通过 cookies 总数的显著增加来判断登录成功
    if new_cookies.len() > old_cookies.len() + 1 {
        println!("🎉 [Rust] cookies 数量显著增加: {} -> {} - 可能登录成功！", old_cookies.len(), new_cookies.len());
        return true;
    }
    
    false
}

// 获取窗口的 cookies
async fn get_window_cookies(app: &AppHandle, window_label: &str, site_origin: &str) -> Result<Vec<CookieKV>, String> {
    let win: WebviewWindow = app
        .get_webview_window(window_label)
        .ok_or_else(|| format!("window '{}' not found", window_label))?;

    let url = Url::parse(site_origin).map_err(|e| e.to_string())?;
    let cookies = win.cookies_for_url(url).map_err(|e| e.to_string())?;
    
    let cookie_list = cookies
        .into_iter()
        .map(|c| CookieKV {
            name: c.name().to_string(),
            value: c.value().to_string(),
            domain: c.domain().unwrap_or_default().to_string(),
            path: c.path().unwrap_or("/").to_string(),
            secure: c.secure().unwrap_or(false),
            http_only: c.http_only().unwrap_or(false),
        })
        .collect();
        
    Ok(cookie_list)
}

#[tauri::command]
async fn get_all_cookies_for(
    app: tauri::AppHandle,
    window_label: String,
    site_origin: Option<String>,
) -> Result<Vec<CookieKV>, String> {
    println!("🔍 [Rust] get_all_cookies_for 被调用");
    println!("📋 [Rust] 参数 - window_label: {}, site_origin: {:?}", window_label, site_origin);
    
    let win: WebviewWindow = app
        .get_webview_window(&window_label)
        .ok_or_else(|| {
            let error_msg = format!("window '{}' not found", window_label);
            println!("❌ [Rust] 错误: {}", error_msg);
            error_msg
        })?;

    println!("✅ [Rust] 找到窗口: {}", window_label);

    let out: Vec<CookieKV> = if let Some(origin) = site_origin {
        println!("🌐 [Rust] 获取指定域名的 cookies: {}", origin);
        let url = Url::parse(origin.as_str()).map_err(|e| {
            let error_msg = format!("URL 解析失败: {}", e);
            println!("❌ [Rust] {}", error_msg);
            error_msg
        })?;
        
        let cookies = win.cookies_for_url(url).map_err(|e| {
            let error_msg = format!("获取指定 URL cookies 失败: {}", e);
            println!("❌ [Rust] {}", error_msg);
            error_msg
        })?;
        
        println!("📊 [Rust] 获取到 {} 个指定域名的 cookies", cookies.len());
        
        cookies
            .into_iter()
            .map(|c| CookieKV {
                name: c.name().to_string(),
                value: c.value().to_string(),
                domain: c.domain().unwrap_or_default().to_string(),
                path: c.path().unwrap_or("/").to_string(),
                secure: c.secure().unwrap_or(false),
                http_only: c.http_only().unwrap_or(false),
            })
            .collect()
    } else {
        println!("🍪 [Rust] 获取所有 cookies");
        let cookies = win.cookies().map_err(|e| {
            let error_msg = format!("获取所有 cookies 失败: {}", e);
            println!("❌ [Rust] {}", error_msg);
            error_msg
        })?;
        
        println!("📊 [Rust] 获取到 {} 个 cookies", cookies.len());
        
        cookies
            .into_iter()
            .map(|c| CookieKV {
                name: c.name().to_string(),
                value: c.value().to_string(),
                domain: c.domain().unwrap_or_default().to_string(),
                path: c.path().unwrap_or("/").to_string(),
                secure: c.secure().unwrap_or(false),
                http_only: c.http_only().unwrap_or(false),
            })
            .collect()
    };

    // 打印 cookies 详情（仅显示名称，避免敏感信息泄露）
    println!("🔍 [Rust] Cookies 详情:");
    for (i, cookie) in out.iter().enumerate() {
        println!("  {}. {} (domain: {}, path: {})", i + 1, cookie.name, cookie.domain, cookie.path);
    }

    // 注意：这个命令主要用于手动获取 cookies，不发送事件
    // 自动登录检测通过 start_cookie_watcher 实现
    
    println!("🎯 [Rust] get_all_cookies_for 执行完成，返回 {} 个 cookies", out.len());
    Ok(out)
}

#[tauri::command]
async fn start_cookie_watcher(
    app: AppHandle,
    window_label: String,
    site_origin: String,
) -> Result<(), String> {
    println!("🚀 [Rust] 启动 cookies 监听器 - window: {}, origin: {}", window_label, site_origin);
    
    let app_clone = app.clone();
    let window_label_clone = window_label.clone();
    let site_origin_clone = site_origin.clone();
    
    // 获取初始 cookies
    let initial_cookies = match get_window_cookies(&app, &window_label, &site_origin).await {
        Ok(cookies) => {
            println!("📝 [Rust] 初始 cookies 数量: {}", cookies.len());
            cookies
        }
        Err(e) => {
            println!("❌ [Rust] 获取初始 cookies 失败: {}", e);
            return Err(e);
        }
    };
    
    // 启动后台任务监听 cookies 变化
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(2));
        let mut last_cookies = initial_cookies;
        let mut check_count = 0;
        let max_checks = 150;
        
        println!("🔄 [Rust] 开始监听 cookies 变化...");
        
        loop {
            interval.tick().await;
            check_count += 1;
            
            // 检查窗口是否还存在
            if app_clone.get_webview_window(&window_label_clone).is_none() {
                println!("🔒 [Rust] 窗口 '{}' 已关闭，停止监听", window_label_clone);
                break;
            }
            
            // 超时检查
            if check_count > max_checks {
                println!("⏰ [Rust] 监听超时，停止监听 cookies 变化");
                break;
            }
            
            // 获取当前 cookies
            match get_window_cookies(&app_clone, &window_label_clone, &site_origin_clone).await {
                Ok(current_cookies) => {
                    println!("🔍 [Rust] 检查 cookies 变化 #{}: {} 个 cookies", check_count, current_cookies.len());
                    
                    // 检查是否有新的认证 cookies（登录成功）
                    if has_new_auth_cookies(&last_cookies, &current_cookies) {
                        println!("🎉 [Rust] 检测到认证 cookies 变化！发送事件...");
                        
                        // 发送 cookies 变化事件
                        if let Err(e) = app_clone.emit("login-cookies-detected", &current_cookies) {
                            println!("❌ [Rust] 发送 login-cookies-detected 事件失败: {}", e);
                        } else {
                            println!("✅ [Rust] login-cookies-detected 事件发送成功");
                        }
                        
                        // 停止监听
                        println!("🛑 [Rust] 检测到登录成功，停止监听");
                        break;
                    }
                    
                    last_cookies = current_cookies;
                }
                Err(e) => {
                    println!("❌ [Rust] 获取 cookies 失败: {}", e);
                    // 继续监听，可能是临时错误
                }
            }
        }
        
        println!("🏁 [Rust] cookies 监听器已停止");
    });
    
    Ok(())
}

#[tauri::command]
async fn stop_cookie_watcher(window_label: String) -> Result<(), String> {
    println!("🛑 [Rust] 停止 cookies 监听器 - window: {}", window_label);
    // 注意：由于我们使用的是基于窗口存在性的检查，当窗口关闭时监听器会自动停止
    // 这个命令主要用于手动停止
    Ok(())
}

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
        .invoke_handler(tauri::generate_handler![
            get_all_cookies_for,
            start_cookie_watcher,
            stop_cookie_watcher
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
