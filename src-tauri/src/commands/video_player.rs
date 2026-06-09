use flate2::read::GzDecoder;
use serde::Serialize;
use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const STREAM_CHUNK_SIZE: usize = 64 * 1024;

#[derive(Clone, Serialize)]
struct FileChunkPayload {
    chunk: String,
}

#[derive(Clone, Serialize)]
struct FileErrorPayload {
    message: String,
}

fn player_temp_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("videoplayer");

    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    }

    Ok(dir)
}

fn sanitize_filename(raw: &str) -> String {
    let name = Path::new(raw)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("video-player.tmp");

    name.chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => ch,
            _ => '_',
        })
        .collect()
}

fn unique_temp_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let safe_name = sanitize_filename(file_name);
    Ok(player_temp_dir(app)?.join(format!("{}_{}", stamp, safe_name)))
}

#[tauri::command]
pub fn write_video_player_gzip_file(
    app: AppHandle,
    buffer: Vec<u8>,
    file_name: String,
) -> Result<String, String> {
    let mut decoder = GzDecoder::new(buffer.as_slice());
    let output_path = unique_temp_path(&app, &file_name)?;
    let mut output_file =
        File::create(&output_path).map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut chunk = [0_u8; STREAM_CHUNK_SIZE];

    loop {
        let read = decoder
            .read(&mut chunk)
            .map_err(|e| format!("Failed to decompress gzip file: {}", e))?;

        if read == 0 {
            break;
        }

        output_file
            .write_all(&chunk[..read])
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
    }

    output_file
        .flush()
        .map_err(|e| format!("Failed to flush temp file: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_video_player_text_stream(
    app: AppHandle,
    event_id: String,
    file_path: String,
) -> Result<(), String> {
    let chunk_event = format!("videoplayer://{}/chunk", event_id);
    let end_event = format!("videoplayer://{}/end", event_id);
    let error_event = format!("videoplayer://{}/error", event_id);

    let file = match File::open(&file_path) {
        Ok(file) => file,
        Err(e) => {
            let _ = app.emit(
                &error_event,
                FileErrorPayload {
                    message: format!("Failed to open file: {}", e),
                },
            );
            return Err(format!("Failed to open file: {}", e));
        }
    };

    let mut reader = BufReader::new(file);
    let mut chunk = vec![0_u8; STREAM_CHUNK_SIZE];

    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(read) => {
                let payload = FileChunkPayload {
                    chunk: String::from_utf8_lossy(&chunk[..read]).to_string(),
                };

                if let Err(e) = app.emit(&chunk_event, payload) {
                    return Err(format!("Failed to emit file chunk: {}", e));
                }
            }
            Err(e) => {
                let message = format!("Failed to read file: {}", e);
                let _ = app.emit(
                    &error_event,
                    FileErrorPayload {
                        message: message.clone(),
                    },
                );
                return Err(message);
            }
        }
    }

    app.emit(&end_event, ())
        .map_err(|e| format!("Failed to emit stream end: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_video_player_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(file_path);

    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
}
