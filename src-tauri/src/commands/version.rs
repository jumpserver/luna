use crate::api::request::ApiResponse;
use crate::api::session::ApiSessionStore;
use crate::service::version::VersionService;
use tauri::State;

#[tauri::command]
pub async fn get_version_message(
    session: State<'_, ApiSessionStore>,
) -> Result<ApiResponse, String> {
    let context = session
        .current_context()
        .ok_or_else(|| "missing current api session".to_string())?;

    let version_service = VersionService::new(context.origin).map_err(|error| error.to_string())?;
    let version_message = version_service.get_version_message().await;

    Ok(version_message)
}
