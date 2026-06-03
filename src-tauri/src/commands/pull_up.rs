use log::{error, info};
use std::env;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc::RecvTimeoutError;
use std::thread;
use std::time::Duration;
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
                candidates.push(
                    base.join("resources")
                        .join("bin")
                        .join(subdir)
                        .join(exe_name),
                );
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
pub fn pull_up(_app: AppHandle, url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        let err_msg = "pull_up called with empty url";
        error!("{}", err_msg);
        return Err(err_msg.to_string());
    }

    // 对应 JS: is.dev && !process.env.IS_TEST
    let is_test = env::var("IS_TEST")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let is_dev = cfg!(debug_assertions) && !is_test;

    let Some(exe_path) = resolve_executable(is_dev) else {
        let err_msg = format!(
            "JumpServerClient executable not found. Searched: {:?}",
            candidate_paths(is_dev)
        );
        error!("{}", err_msg);
        return Err(err_msg);
    };

    info!("Launching client: {:?} {}", exe_path, url);

    // 使用管道捕获 stderr，以便检测子进程的错误输出
    let mut child = Command::new(&exe_path)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let err_msg = format!("Failed to launch client: {}", e);
            error!("{}", err_msg);
            err_msg
        })?;

    // 获取 stderr 的读取器
    let stderr = child.stderr.take().ok_or_else(|| {
        let err_msg = "Failed to capture stderr from client process";
        error!("{}", err_msg);
        err_msg.to_string()
    })?;

    // 使用通道来在后台线程和主线程之间通信
    let (tx, rx) = std::sync::mpsc::channel::<String>();

    // 在后台线程中读取 stderr，检查是否有错误输出
    thread::spawn(move || {
        let reader = BufReader::new(stderr);

        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let lower = line.to_lowercase();
                    // 检查是否是错误行（Go 客户端错误通常以 "Error:" 开头）
                    if lower.contains("error:") {
                        error!("Client stderr: {}", line);
                        // 立即发送错误信号
                        let _ = tx.send(line.clone());
                    } else if !line.trim().is_empty() {
                        // 记录所有非空输出，可能是警告或错误
                        error!("Client stderr: {}", line);
                        // 如果包含常见错误关键词，也收集起来
                        if lower.contains("not found")
                            || lower.contains("not configured")
                            || lower.contains("failed")
                            || lower.contains("application configured or found")
                        {
                            let _ = tx.send(line);
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to read stderr line: {}", e);
                    break;
                }
            }
        }
    });

    // 等待并循环检查错误输出，最多等待2秒
    for _ in 0..20 {
        // 检查是否有错误消息
        if let Ok(error_msg) = rx.try_recv() {
            let err_msg = format!("Client error: {}", error_msg);
            error!("{}", err_msg);
            return Err(err_msg);
        }

        // 检查进程是否已经退出（可能因为错误而退出）
        if let Ok(Some(status)) = child.try_wait() {
            // 进程已退出：等待一小段时间把 stderr reader 的最后一行收进来（避免进程快速退出导致漏报）
            match rx.recv_timeout(Duration::from_millis(300)) {
                Ok(error_msg) => {
                    let err_msg = format!("Client error: {}", error_msg);
                    error!("{}", err_msg);
                    return Err(err_msg);
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {}
            }

            if !status.success() {
                let err_msg = format!("Client process exited with status: {:?}", status);
                error!("{}", err_msg);
                return Err(err_msg);
            }

            // 进程成功退出，这是正常的（某些客户端可能立即退出）
            return Ok(());
        }

        thread::sleep(Duration::from_millis(100));
    }

    // 最后再检查一次是否有错误消息（防止在循环结束后才收到错误）
    if let Ok(error_msg) = rx.try_recv() {
        let err_msg = format!("Client error: {}", error_msg);
        error!("{}", err_msg);
        return Err(err_msg);
    }

    // 如果进程仍在运行，这是正常的，让它在后台继续运行
    // 后续的错误会通过事件发送给前端

    Ok(())
}
