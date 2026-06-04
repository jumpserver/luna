use serde_json::Value;
use tauri::AppHandle;

use crate::service::config::ConfigService;

#[tauri::command]
pub async fn update_config_selection(
    app: AppHandle,
    category: String,
    protocol: String,
    name: String,
    path: Option<String>,
) -> Result<Value, String> {
    ConfigService::update_selection(&app, &category, &protocol, &name, path)
}
