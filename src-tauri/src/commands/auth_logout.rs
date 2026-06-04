use crate::service::oauth::revoke_and_clear_tokens;
use log::warn;
use tauri::AppHandle;

#[tauri::command]
pub async fn logout(_app: AppHandle, _name: String, site: String) -> Result<(), String> {
    if let Err(e) = revoke_and_clear_tokens(&site).await {
        warn!("revoke token failed: {}", e);
    }

    Ok(())
}
