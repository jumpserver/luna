use crate::commands::requests::ApiResponse;
use crate::service::version::VersionService;

#[tauri::command]
pub async fn get_version_message(site: String) -> Result<ApiResponse, String> {
    if site.trim().is_empty() {
        return Err("site is empty".to_string());
    }

    let version_service = VersionService::new(site);
    let version_message = version_service.get_version_message().await;

    Ok(version_message)
}
