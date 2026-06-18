use bytes::Bytes;
use log::{error, info};
use russh::client::{self, AuthResult};
use russh::keys::ssh_key;
use russh::{ChannelMsg, Disconnect, Pty};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct BuiltinTerminalState {
    sessions: Mutex<HashMap<String, BuiltinTerminalSession>>,
}

struct BuiltinTerminalSession {
    handle: client::Handle<ClientHandler>,
    write: russh::ChannelWriteHalf<client::Msg>,
}

struct ClientHandler;

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinSshStartPayload {
    tab_id: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    cols: u32,
    rows: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinSessionInputPayload {
    tab_id: String,
    data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinSessionResizePayload {
    tab_id: String,
    cols: u32,
    rows: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinSessionClosePayload {
    tab_id: String,
}

#[tauri::command]
pub async fn builtin_ssh_start(
    app: AppHandle,
    state: State<'_, BuiltinTerminalState>,
    payload: BuiltinSshStartPayload,
) -> Result<(), String> {
    close_existing(&state, &payload.tab_id).await;

    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(60)),
        ..<_>::default()
    });

    let addr = (payload.host.as_str(), payload.port);
    let mut handle = client::connect(config, addr, ClientHandler)
        .await
        .map_err(|error| format!("connect ssh gateway failed: {error}"))?;

    let auth = handle
        .authenticate_password(payload.username.clone(), payload.password.clone())
        .await
        .map_err(|error| format!("authenticate ssh gateway failed: {error}"))?;

    if !matches!(auth, AuthResult::Success) {
        return Err("authenticate ssh gateway failed".to_string());
    }

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|error| format!("open ssh session channel failed: {error}"))?;

    channel
        .request_pty(
            true,
            "xterm-256color",
            payload.cols.max(1),
            payload.rows.max(1),
            0,
            0,
            &[(Pty::ECHO, 1)],
        )
        .await
        .map_err(|error| format!("request pty failed: {error}"))?;

    channel
        .request_shell(true)
        .await
        .map_err(|error| format!("request shell failed: {error}"))?;

    let tab_id = payload.tab_id.clone();
    let (mut read, write) = channel.split();

    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(payload.tab_id.clone(), BuiltinTerminalSession { handle, write });
    }

    info!("builtin ssh session started: {}", tab_id);
    let _ = app.emit("builtin-session-ready", json!({ "tabId": tab_id }));

    tauri::async_runtime::spawn(async move {
        while let Some(msg) = read.wait().await {
            match msg {
                ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                    let text = String::from_utf8_lossy(&data).to_string();
                    let _ = app.emit(
                        "builtin-session-output",
                        json!({
                            "tabId": tab_id,
                            "data": text
                        }),
                    );
                }
                ChannelMsg::ExitStatus { exit_status } => {
                    let _ = app.emit(
                        "builtin-session-exit",
                        json!({
                            "tabId": tab_id,
                            "status": exit_status
                        }),
                    );
                    break;
                }
                ChannelMsg::Eof => {
                    let _ = app.emit("builtin-session-exit", json!({ "tabId": tab_id }));
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn builtin_session_input(
    state: State<'_, BuiltinTerminalState>,
    payload: BuiltinSessionInputPayload,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&payload.tab_id)
        .ok_or_else(|| "builtin session not found".to_string())?;

    session
        .write
        .data_bytes(Bytes::from(payload.data.into_bytes()))
        .await
        .map_err(|error| format!("write session input failed: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn builtin_session_resize(
    state: State<'_, BuiltinTerminalState>,
    payload: BuiltinSessionResizePayload,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&payload.tab_id)
        .ok_or_else(|| "builtin session not found".to_string())?;

    session
        .write
        .window_change(payload.cols.max(1), payload.rows.max(1), 0, 0)
        .await
        .map_err(|error| format!("resize session failed: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn builtin_session_close(
    state: State<'_, BuiltinTerminalState>,
    payload: BuiltinSessionClosePayload,
) -> Result<(), String> {
    close_existing(&state, &payload.tab_id).await;
    Ok(())
}

async fn close_existing(state: &State<'_, BuiltinTerminalState>, tab_id: &str) {
    let mut sessions = state.sessions.lock().await;

    if let Some(session) = sessions.remove(tab_id) {
        if let Err(error) = session
            .handle
            .disconnect(Disconnect::ByApplication, "", "English")
            .await
        {
            error!("close builtin ssh session failed: {}", error);
        }
    }
}
