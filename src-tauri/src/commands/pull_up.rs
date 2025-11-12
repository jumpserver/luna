use log::{error, info};
use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::AppHandle;

// 映射平台/架构到二进制所在子目录
fn platform_subdir() -> Option<&'static str> {
    let os = env::consts::OS; // "linux" | "macos" | "windows"
    let arch = env::consts::ARCH; // "x86_64" | "aarch64" | "arm" | ...

    match os {
        "linux" => match arch {
            "x86_64" => Some("linux-amd64"),
            "arm" | "aarch64" => Some("linux-arm64"),
            _ => None,
        },
        "macos" => match arch {
            "x86_64" => Some("darwin-amd64"),
            "arm" | "aarch64" => Some("darwin-arm64"),
            _ => None,
        },
        "windows" => Some("windows"),
        _ => None,
    }
}

// Windows 追加 .exe，其它平台不变
fn executable_name() -> &'static str {
    if env::consts::OS == "windows" {
        "JumpServerClient.exe"
    } else {
        "JumpServerClient"
    }
}

// 生成可能的可执行路径候选：
// - 开发模式：相对项目根的 bin/<subdir>/JumpServerClient[.exe]
// - 生产模式：打包后可执行同级，或 macOS 的 Resources 目录
fn candidate_paths(is_dev: bool) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let subdir = match platform_subdir() {
        Some(s) => s,
        None => return candidates,
    };

    let exe_name = executable_name();

    if is_dev {
        // 开发模式：尝试 ./、../、../../ 三个相对位置，方便在不同工作目录下运行
        let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let bases = [cwd.clone(), cwd.join(".."), cwd.join("../..")];
        for base in bases {
            let p = base
                .join("resources")
                .join("bin")
                .join(subdir)
                .join(exe_name);
            candidates.push(p);
        }
    } else {
        if let Ok(current_exe) = env::current_exe() {
            if let Some(base) = current_exe.parent() {
                candidates.push(base.join("resources").join("bin").join(subdir).join(exe_name));
                // macOS 打包：App.app/Contents/MacOS/ 下为运行目录
                // 资源常在 App.app/Contents/Resources/
                if cfg!(target_os = "macos") {
                    if let Some(contents) = base.parent() {
                        let resources = contents.join("Resources").join("resources").join("bin");
                        candidates.push(resources.join(subdir).join(exe_name));
                    }
                }
            }
        }
    }

    candidates
}

fn resolve_executable(is_dev: bool) -> Option<PathBuf> {
    for p in candidate_paths(is_dev) {
        if p.exists() && p.is_file() {
            return Some(p);
        }
    }
    None
}

#[tauri::command]
/// 启动本地 JumpServerClient 可执行文件，并传入 URL 参数
/// 前端：invoke('pull_up', { url })
pub fn pull_up(_app: AppHandle, url: String) {
    if url.trim().is_empty() {
        error!("pull_up called with empty url");
        return;
    }

    // 对应 JS: is.dev && !process.env.IS_TEST
    let is_test = env::var("IS_TEST")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let is_dev = cfg!(debug_assertions) && !is_test;

    let Some(exe_path) = resolve_executable(is_dev) else {
        error!(
            "JumpServerClient executable not found. Searched: {:?}",
            candidate_paths(is_dev)
        );
        return;
    };

    info!("Launching client: {:?} {}", exe_path, url);

    if let Err(e) = Command::new(&exe_path)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
    {
        error!("Failed to launch client: {}", e);
    }
}
