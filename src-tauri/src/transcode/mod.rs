pub mod encoder;
/// Replay transcoding module.
///
/// Provides Tauri commands for converting JumpServer guacamole session
/// recordings (`.tar` archives containing `.part.gz` + `.replay.json`)
/// into H.264 MP4 video files.
mod parser;
mod renderer;
mod transcode;

use flate2::read::GzDecoder;
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ReplayMetadata {
    pub id: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub account: String,
    #[serde(default)]
    pub login_from: String,
    #[serde(default)]
    pub remote_addr: String,
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub date_start: String,
    #[serde(default)]
    pub date_end: String,
    #[serde(default)]
    pub org_id: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub asset_id: String,
    #[serde(default)]
    pub account_id: String,
    #[serde(default, rename = "type")]
    pub recording_type: String,
    #[serde(default)]
    pub files: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "snake_case")]
pub enum FilenameStyle {
    #[default]
    Original,
    Friendly,
    FriendlyUuid,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OutputResolution {
    #[default]
    Original,
    P1080,
    P720,
    P360,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TranscodePower {
    Auto,
    #[default]
    Full,
    Fast,
    Medium,
    Low,
}

impl TranscodePower {
    fn cpu_fraction(&self) -> f64 {
        match self {
            TranscodePower::Auto | TranscodePower::Full => 1.0,
            TranscodePower::Fast => 0.75,
            TranscodePower::Medium => 0.5,
            TranscodePower::Low => 0.25,
        }
    }
}

impl OutputResolution {
    fn target_height(&self) -> Option<u32> {
        match self {
            OutputResolution::Original => None,
            OutputResolution::P1080 => Some(1080),
            OutputResolution::P720 => Some(720),
            OutputResolution::P360 => Some(360),
        }
    }
}

fn compute_target_dimensions(
    src_width: u32,
    src_height: u32,
    resolution: &OutputResolution,
) -> (u32, u32) {
    let Some(target_h) = resolution.target_height() else {
        return (src_width & !15, src_height & !15);
    };
    if src_height <= target_h {
        return (src_width & !15, src_height & !15);
    }
    let scale = target_h as f64 / src_height as f64;
    let w = ((src_width as f64 * scale).round() as u32).max(16) & !15;
    let h = target_h & !15;
    (w, h)
}

pub(crate) fn bitrate_for_resolution(width: u32, height: u32) -> u32 {
    let pixels = (width as u64) * (height as u64);
    let bitrate = pixels * 50 / 10;
    (bitrate as u32).clamp(800_000, 20_000_000)
}

#[derive(Debug, Serialize, Clone)]
pub struct TranscodeResult {
    id: String,
    input: String,
    output: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<ReplayMetadata>,
}

#[derive(Serialize, Clone)]
struct TranscodeProgress {
    file: String,
    index: usize,
    total: usize,
    progress: f32,
    message: String,
    /// Set on the terminal per-task event (progress=100) so the UI can mark
    /// the task complete before `transcode_replays` returns the full batch.
    #[serde(skip_serializing_if = "Option::is_none")]
    success: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output: Option<String>,
    /// Transcoding duration in seconds (only set on completion events)
    #[serde(skip_serializing_if = "Option::is_none")]
    duration: Option<f64>,
    /// Populated on the first (0%) per-task event so the UI can display
    /// session details (user, asset, account, remote_addr, date range) without
    /// waiting for the batch to finish.
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<ReplayMetadata>,
}

/// Transcode one or more `.tar` replay archives to H.264 MP4 video files.
///
/// Each `.tar` should contain:
/// - `<uuid>.replay.json` — session metadata
/// - `<uuid>.0.part.gz` — gzip-compressed guacamole recording
///
/// Emits `transcode-progress` events with per-file progress (0–100%).
#[tauri::command]
pub async fn transcode_replays(
    app: AppHandle,
    tar_paths: Vec<String>,
    output_dir: String,
    filename_style: Option<FilenameStyle>,
    output_resolution: Option<OutputResolution>,
    transcode_power: Option<TranscodePower>,
) -> Result<Vec<TranscodeResult>, String> {
    let total = tar_paths.len();
    if total == 0 {
        return Ok(Vec::new());
    }

    let style = filename_style.unwrap_or_default();
    let resolution = output_resolution.unwrap_or_default();
    let power = transcode_power.unwrap_or_default();

    info!("starting replay transcoding: files={}", total);

    #[cfg(not(windows))]
    {
        let mut results = Vec::with_capacity(total);

        for (idx, tar_path_str) in tar_paths.into_iter().enumerate() {
            let app_handle = app.clone();
            let output_dir = output_dir.clone();
            let style = style.clone();
            let resolution = resolution.clone();
            let power = power.clone();
            let panic_session_id = extract_session_id(
                PathBuf::from(&tar_path_str)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .as_ref(),
            );

            let result = tokio::task::spawn_blocking(move || {
                catch_unwind(AssertUnwindSafe(|| {
                    transcode_single_tar(
                        app_handle,
                        tar_path_str,
                        output_dir,
                        idx,
                        total,
                        style,
                        resolution,
                        power,
                    )
                }))
            })
            .await;

            match result {
                Ok(Ok(task_result)) => results.push(task_result),
                Ok(Err(panic_payload)) => {
                    let err = format!(
                        "transcoding task panicked: {}",
                        panic_payload_to_string(panic_payload)
                    );
                    emit_progress(
                        &app,
                        &panic_session_id,
                        idx,
                        total,
                        100.0,
                        "failed".into(),
                        Some(false),
                        None,
                        None,
                        None,
                    );
                    results.push(TranscodeResult {
                        id: panic_session_id,
                        input: String::new(),
                        output: String::new(),
                        success: false,
                        error: Some(err),
                        metadata: None,
                    });
                }
                Err(e) => {
                    let err = format!("spawn transcoding task failed: {}", e);
                    emit_progress(
                        &app,
                        &panic_session_id,
                        idx,
                        total,
                        100.0,
                        "failed".into(),
                        Some(false),
                        None,
                        None,
                        None,
                    );
                    results.push(TranscodeResult {
                        id: panic_session_id,
                        input: String::new(),
                        output: String::new(),
                        success: false,
                        error: Some(err),
                        metadata: None,
                    });
                }
            }
        }

        Ok(results)
    }

    #[cfg(windows)]
    {
        const MAX_CONCURRENT: usize = 2;
        let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT));
        let mut handles = Vec::with_capacity(total);

        info!(
            "Windows parallel transcoding: files={}, concurrency={}",
            total, MAX_CONCURRENT
        );

        for (idx, tar_path_str) in tar_paths.into_iter().enumerate() {
            let app_handle = app.clone();
            let output_dir = output_dir.clone();
            let style = style.clone();
            let resolution = resolution.clone();
            let power = power.clone();
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let panic_session_id = extract_session_id(
                PathBuf::from(&tar_path_str)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .as_ref(),
            );

            let handle = tokio::task::spawn_blocking(move || {
                let _permit = permit;
                catch_unwind(AssertUnwindSafe(|| {
                    transcode_single_tar(
                        app_handle,
                        tar_path_str,
                        output_dir,
                        idx,
                        total,
                        style,
                        resolution,
                        power,
                    )
                }))
            });

            handles.push((idx, panic_session_id, handle));
        }

        let mut results = Vec::with_capacity(total);

        for (idx, panic_session_id, handle) in handles {
            let result = handle.await;
            match result {
                Ok(Ok(task_result)) => results.push((idx, task_result)),
                Ok(Err(panic_payload)) => {
                    let err = format!(
                        "transcoding task panicked: {}",
                        panic_payload_to_string(panic_payload)
                    );
                    emit_progress(
                        &app,
                        &panic_session_id,
                        idx,
                        total,
                        100.0,
                        "failed".into(),
                        Some(false),
                        None,
                        None,
                        None,
                    );
                    results.push((
                        idx,
                        TranscodeResult {
                            id: panic_session_id,
                            input: String::new(),
                            output: String::new(),
                            success: false,
                            error: Some(err),
                            metadata: None,
                        },
                    ));
                }
                Err(e) => {
                    let err = format!("spawn transcoding task failed: {}", e);
                    emit_progress(
                        &app,
                        &panic_session_id,
                        idx,
                        total,
                        100.0,
                        "failed".into(),
                        Some(false),
                        None,
                        None,
                        None,
                    );
                    results.push((
                        idx,
                        TranscodeResult {
                            id: panic_session_id,
                            input: String::new(),
                            output: String::new(),
                            success: false,
                            error: Some(err),
                            metadata: None,
                        },
                    ));
                }
            }
        }

        results.sort_by_key(|(idx, _)| *idx);
        Ok(results.into_iter().map(|(_, r)| r).collect())
    }
}

fn panic_payload_to_string(payload: Box<dyn std::any::Any + Send>) -> String {
    match payload.downcast::<String>() {
        Ok(message) => *message,
        Err(payload) => match payload.downcast::<&'static str>() {
            Ok(message) => (*message).to_string(),
            Err(_) => "unknown panic".to_string(),
        },
    }
}

fn transcode_single_tar(
    app: AppHandle,
    tar_path_str: String,
    output_dir: String,
    file_index: usize,
    total: usize,
    style: FilenameStyle,
    resolution: OutputResolution,
    power: TranscodePower,
) -> TranscodeResult {
    let tar_path = PathBuf::from(&tar_path_str);
    let tar_name = tar_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let fallback_session_id = extract_session_id(&tar_name);

    let extraction = match extract_tar_payloads(&tar_path, &fallback_session_id) {
        Ok(v) => v,
        Err((sid, err)) => {
            error!("tar extraction failed for {}: {}", tar_name, err);
            emit_progress(
                &app,
                &sid,
                file_index,
                total,
                100.0,
                err.clone(),
                Some(false),
                None,
                None,
                None,
            );
            return TranscodeResult {
                id: sid,
                input: tar_path_str,
                output: String::new(),
                success: false,
                error: Some(err),
                metadata: None,
            };
        }
    };

    let metadata = match serde_json::from_slice::<ReplayMetadata>(&extraction.replay_json) {
        Ok(m) => m,
        Err(e) => {
            let err = format!("parse replay.json failed: {}", e);
            error!("{} for {}", err, tar_name);
            emit_progress(
                &app,
                &fallback_session_id,
                file_index,
                total,
                100.0,
                err.clone(),
                Some(false),
                None,
                None,
                None,
            );
            return TranscodeResult {
                id: fallback_session_id,
                input: tar_path_str,
                output: String::new(),
                success: false,
                error: Some(err),
                metadata: None,
            };
        }
    };

    // First per-task event — ship the metadata so the UI can show session
    // details the moment the task appears in the list.
    emit_progress(
        &app,
        &metadata.id,
        file_index,
        total,
        0.0,
        "extracting archive".into(),
        None,
        None,
        Some(metadata.clone()),
        None,
    );

    let inner_result = transcode_single_tar_inner(
        &app,
        &metadata,
        extraction.parts,
        &output_dir,
        file_index,
        total,
        &style,
        &resolution,
        &power,
    );

    let (output_path, success, error_message) = match &inner_result {
        Ok(path) => (path.clone(), true, None),
        Err(err) => {
            error!("transcode failed for {}: {}", tar_name, err);
            (String::new(), false, Some(err.clone()))
        }
    };

    TranscodeResult {
        id: metadata.id.clone(),
        input: tar_path_str,
        output: output_path,
        success,
        error: error_message,
        metadata: Some(metadata),
    }
}

struct ExtractedTar {
    replay_json: Vec<u8>,
    parts: Vec<(usize, Vec<u8>)>,
}

fn extract_tar_payloads(
    tar_path: &Path,
    fallback_session_id: &str,
) -> Result<ExtractedTar, (String, String)> {
    let tar_file = std::fs::File::open(tar_path).map_err(|e| {
        (
            fallback_session_id.to_string(),
            format!("open tar failed: {}", e),
        )
    })?;
    let mut archive = tar::Archive::new(tar_file);

    let mut replay_json: Option<Vec<u8>> = None;
    let mut parts: Vec<(usize, Vec<u8>)> = Vec::new();

    for entry_result in archive.entries().map_err(|e| {
        (
            fallback_session_id.to_string(),
            format!("tar read failed: {}", e),
        )
    })? {
        let mut entry = entry_result.map_err(|e| {
            (
                fallback_session_id.to_string(),
                format!("tar entry error: {}", e),
            )
        })?;
        let entry_path = entry
            .path()
            .map_err(|e| {
                (
                    fallback_session_id.to_string(),
                    format!("entry path error: {}", e),
                )
            })?
            .to_path_buf();
        let filename = entry_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if filename.ends_with(".replay.json") {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| {
                (
                    fallback_session_id.to_string(),
                    format!("read replay.json failed: {}", e),
                )
            })?;
            replay_json = Some(buf);
        } else if let Some(index) = parse_part_index(&filename) {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| {
                (
                    fallback_session_id.to_string(),
                    format!("read part.gz failed for {}: {}", filename, e),
                )
            })?;
            parts.push((index, buf));
        }
    }

    let replay_json = replay_json.ok_or_else(|| {
        (
            fallback_session_id.to_string(),
            "replay.json not found in tar archive".to_string(),
        )
    })?;
    if parts.is_empty() {
        return Err((
            fallback_session_id.to_string(),
            ".part.gz file not found in tar archive".to_string(),
        ));
    }
    parts.sort_by_key(|(index, _)| *index);

    Ok(ExtractedTar { replay_json, parts })
}

/// Parse the numeric index from a `<uuid>.<N>.part.gz` filename.
fn parse_part_index(filename: &str) -> Option<usize> {
    let suffix = ".part.gz";
    if !filename.ends_with(suffix) {
        return None;
    }
    let stem = &filename[..filename.len() - suffix.len()];
    let dot = stem.rfind('.')?;
    stem[dot + 1..].parse::<usize>().ok()
}

fn sanitize_filename_field(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn build_output_filename(metadata: &ReplayMetadata, style: &FilenameStyle) -> String {
    match style {
        FilenameStyle::Original => format!("{}.mp4", metadata.id),
        FilenameStyle::Friendly => {
            let user = sanitize_filename_field(&metadata.user);
            let asset = sanitize_filename_field(&metadata.asset);
            let account = sanitize_filename_field(&metadata.account);
            format!("{}-{}-{}.mp4", user, asset, account)
        }
        FilenameStyle::FriendlyUuid => {
            let user = sanitize_filename_field(&metadata.user);
            let asset = sanitize_filename_field(&metadata.asset);
            let account = sanitize_filename_field(&metadata.account);
            format!("{}-{}-{}({}).mp4", user, asset, account, metadata.id)
        }
    }
}

fn transcode_single_tar_inner(
    app: &AppHandle,
    metadata: &ReplayMetadata,
    parts: Vec<(usize, Vec<u8>)>,
    output_dir: &str,
    file_index: usize,
    total: usize,
    style: &FilenameStyle,
    resolution: &OutputResolution,
    power: &TranscodePower,
) -> Result<String, String> {
    let session_id = &metadata.id;

    let mut guac_data = Vec::new();
    for (idx, gz) in &parts {
        let mut decoder = GzDecoder::new(gz.as_slice());
        decoder
            .read_to_end(&mut guac_data)
            .map_err(|e| format!("gzip decompress failed for part {}: {}", idx, e))?;
    }

    std::fs::create_dir_all(output_dir).map_err(|e| format!("create output dir failed: {}", e))?;

    let output_path = PathBuf::from(output_dir).join(build_output_filename(metadata, style));

    let transcode_start = std::time::Instant::now();

    let app_clone = app.clone();
    let session_id_clone = session_id.to_string();

    match transcode::transcode_to_mp4(
        &guac_data,
        &output_path,
        resolution.clone(),
        power.cpu_fraction(),
        move |pct| {
            emit_progress(
                &app_clone,
                &session_id_clone,
                file_index,
                total,
                pct,
                format!("encoding: {:.0}%", pct),
                None,
                None,
                None,
                None,
            );
        },
    ) {
        Ok(()) => {
            let duration = transcode_start.elapsed().as_secs_f64();
            emit_progress(
                app,
                session_id,
                file_index,
                total,
                100.0,
                "done".into(),
                Some(true),
                Some(output_path.to_string_lossy().into_owned()),
                None,
                Some(duration),
            );
        }
        Err(e) => {
            let err = format!("transcoding failed: {}", e);
            emit_progress(
                app,
                session_id,
                file_index,
                total,
                100.0,
                err.clone(),
                Some(false),
                None,
                None,
                None,
            );
            return Err(err);
        }
    }

    Ok(output_path.to_string_lossy().into_owned())
}

fn emit_progress(
    app: &AppHandle,
    file: &str,
    index: usize,
    total: usize,
    progress: f32,
    message: String,
    success: Option<bool>,
    output: Option<String>,
    metadata: Option<ReplayMetadata>,
    duration: Option<f64>,
) {
    let _ = app.emit(
        "transcode-progress",
        TranscodeProgress {
            file: file.to_string(),
            index,
            total,
            progress,
            message,
            success,
            output,
            metadata,
            duration,
        },
    );
}

fn extract_session_id(tar_name: &str) -> String {
    tar_name
        .strip_suffix(".tar")
        .unwrap_or(tar_name)
        .to_string()
}
