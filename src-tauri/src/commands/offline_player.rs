use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::offline::{
    package::{import_recording, list_recordings},
    recording::RecordingManifest,
    storage::OfflineStorage,
};

fn storage_from_app(app: &AppHandle) -> Result<OfflineStorage, String> {
    app.try_state::<OfflineStorage>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "offline storage is not initialized".to_owned())
}

/// 把可能阻塞的文件读取和解压工作放到 Tauri 的 blocking 线程池。
///
/// command 参数使用拥有所有权的 String，避免异步任务跨越 `.await`
/// 时借用 IPC 请求中的临时数据。
#[tauri::command]
pub(crate) async fn import_offline_recording(
    app: AppHandle,
    file_path: String,
) -> Result<RecordingManifest, String> {
    let storage = storage_from_app(&app)?;
    let source_path = PathBuf::from(file_path);

    tauri::async_runtime::spawn_blocking(move || {
        import_recording(&storage, &source_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("offline import task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn list_offline_recordings(
    app: AppHandle,
) -> Result<Vec<RecordingManifest>, String> {
    let storage = storage_from_app(&app)?;

    tauri::async_runtime::spawn_blocking(move || {
        list_recordings(&storage).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("offline list task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn remove_offline_recording(
    app: AppHandle,
    recording_id: String,
) -> Result<(), String> {
    let storage = storage_from_app(&app)?;

    tauri::async_runtime::spawn_blocking(move || {
        storage
            .remove_recording(&recording_id)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("offline remove task failed: {error}"))?
}

fn entry_url(recording_id: &str, entry_id: &str) -> String {
    #[cfg(windows)]
    {
        format!("http://offline.localhost/recordings/{recording_id}/entries/{entry_id}")
    }

    #[cfg(not(windows))]
    {
        format!("offline://localhost/recordings/{recording_id}/entries/{entry_id}")
    }
}

/// 返回播放器可读取的 custom protocol URL。
///
/// 调用前先通过 OfflineStorage::resolve_entry 验证两个 ID 和目标文件，
/// 因此前端无法利用该 command 读取任意本地路径。
#[tauri::command]
pub(crate) fn get_offline_entry_url(
    app: AppHandle,
    recording_id: String,
    entry_id: String,
) -> Result<String, String> {
    let storage = storage_from_app(&app)?;
    storage
        .resolve_entry(&recording_id, &entry_id)
        .map_err(|error| error.to_string())?;

    Ok(entry_url(&recording_id, &entry_id))
}
