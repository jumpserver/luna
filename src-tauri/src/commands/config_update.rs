use serde_json::Value;
use tauri::AppHandle;

use crate::service::config::ConfigService;

#[tauri::command]
pub async fn update_config_selection(
    app: AppHandle,
    category: String,
    protocol: String,
    name: String,
    plugin_id: Option<String>,
    path: Option<String>,
    enabled: Option<bool>,
) -> Result<Value, String> {
    ConfigService::update_selection(
        &app,
        &category,
        &protocol,
        &name,
        plugin_id.as_deref(),
        path,
        enabled.unwrap_or(true),
    )
}
