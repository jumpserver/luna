use serde_json::Value;
use tauri::AppHandle;

use crate::service::config::ConfigService;

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<Value, String> {
    ConfigService::get_app_config(&app)
}
