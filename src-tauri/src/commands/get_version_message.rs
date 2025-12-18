use crate::service::version::VersionService;

#[tauri::command]
pub async fn get_version_message(site: String) -> Result<String, String> {
    if site.trim().is_empty() {
        return Err("site is empty".to_string());
    }

    let version_service = VersionService::new(site);
    let version_message = version_service.get_version_message().await;

    if version_message.status == 200 && version_message.success {
        Ok(version_message.data)
    } else if version_message.status == 404 {
        Ok("incompatible".to_string())
    } else {
        Ok("".to_string())
    }
}

