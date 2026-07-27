use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::env;
#[cfg(windows)]
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

struct LocalShellSession {
    child: Box<dyn Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

#[derive(Clone, Default)]
pub struct LocalShellState {
    sessions: Arc<Mutex<HashMap<String, LocalShellSession>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalShellOutput {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalShellExit {
    session_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalShellInfo {
    shell: String,
}

#[cfg(windows)]
fn executable_in_path(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .map(|directory| directory.join(name))
        .find(|candidate| candidate.is_file())
}

#[cfg(windows)]
fn windows_shell_path() -> PathBuf {
    let pwsh_name = "pwsh.exe";
    if let Some(path) = executable_in_path(pwsh_name) {
        return path;
    }

    for root in [
        env::var_os("ProgramFiles"),
        env::var_os("ProgramW6432"),
        Some(OsString::from(r"C:\Program Files")),
    ]
    .into_iter()
    .flatten()
    {
        let candidate = PathBuf::from(root)
            .join("PowerShell")
            .join("7")
            .join(pwsh_name);
        if candidate.is_file() {
            return candidate;
        }
    }

    if let Some(path) = executable_in_path("powershell.exe") {
        return path;
    }

    let system_root = env::var_os("SystemRoot").unwrap_or_else(|| OsString::from(r"C:\Windows"));
    let windows_powershell = PathBuf::from(system_root)
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if windows_powershell.is_file() {
        return windows_powershell;
    }

    PathBuf::from("powershell.exe")
}

#[cfg(not(windows))]
fn default_shell_path() -> PathBuf {
    env::var_os("SHELL")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/bin/bash"))
}

#[cfg(windows)]
fn default_shell_path() -> PathBuf {
    windows_shell_path()
}

fn shell_args(shell: &Path) -> Vec<&'static str> {
    let name = shell
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if matches!(
        name.as_str(),
        "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe"
    ) {
        return vec!["-NoLogo"];
    }

    #[cfg(not(windows))]
    if matches!(name.as_str(), "bash" | "zsh" | "fish" | "ksh") {
        return vec!["-l"];
    }

    Vec::new()
}

#[tauri::command]
pub fn start_local_shell(
    app: AppHandle,
    state: State<'_, LocalShellState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<LocalShellInfo, String> {
    if session_id.trim().is_empty() {
        return Err("local shell session id is required".to_string());
    }

    let shell = default_shell_path();
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let mut command = CommandBuilder::new(&shell);
    command.args(shell_args(&shell));
    if let Some(home) = env::var_os("USERPROFILE").or_else(|| env::var_os("HOME")) {
        command.cwd(home);
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;

    {
        let mut sessions = state.sessions.lock().map_err(|error| error.to_string())?;
        if sessions.contains_key(&session_id) {
            let mut child = child;
            let _ = child.kill();
            return Err("local shell session already exists".to_string());
        }
        sessions.insert(
            session_id.clone(),
            LocalShellSession {
                child,
                master: pair.master,
                writer,
            },
        );
    }

    let state = state.inner().clone();
    let event_session_id = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 16 * 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(size) => {
                    let _ = app.emit(
                        "local-shell-output",
                        LocalShellOutput {
                            session_id: event_session_id.clone(),
                            data: buffer[..size].to_vec(),
                        },
                    );
                }
            }
        }

        if let Ok(mut sessions) = state.sessions.lock() {
            sessions.remove(&event_session_id);
        }
        let _ = app.emit(
            "local-shell-exit",
            LocalShellExit {
                session_id: event_session_id,
            },
        );
    });

    Ok(LocalShellInfo {
        shell: shell.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn write_local_shell(
    state: State<'_, LocalShellState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|error| error.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "local shell session not found".to_string())?;
    session
        .writer
        .write_all(&data)
        .map_err(|error| error.to_string())?;
    session.writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resize_local_shell(
    state: State<'_, LocalShellState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|error| error.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "local shell session not found".to_string())?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn close_local_shell(
    state: State<'_, LocalShellState>,
    session_id: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&session_id);
    if let Some(mut session) = session {
        session.child.kill().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::shell_args;
    use std::path::Path;

    #[test]
    fn powershell_starts_without_logo() {
        assert_eq!(shell_args(Path::new("pwsh.exe")), vec!["-NoLogo"]);
        assert_eq!(shell_args(Path::new("powershell.exe")), vec!["-NoLogo"]);
    }
}
