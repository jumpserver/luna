use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;

use crate::service::plugin::PluginService;

fn plugin_config_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?
        .join("jumpserver-client");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    Ok(dir)
}

#[tauri::command]
pub async fn list_plugins(app: AppHandle) -> Result<Value, String> {
    let config_dir = plugin_config_dir(&app)?;
    PluginService::list_plugins(&app, &config_dir)
}

#[tauri::command]
pub async fn install_plugin(app: AppHandle, path: String) -> Result<Value, String> {
    let config_dir = plugin_config_dir(&app)?;
    PluginService::install_plugin(&app, &config_dir, &path)
}

#[tauri::command]
pub async fn uninstall_plugin(app: AppHandle, plugin_id: String) -> Result<Value, String> {
    let config_dir = plugin_config_dir(&app)?;
    PluginService::uninstall_plugin(&app, &config_dir, &plugin_id)
}

#[tauri::command]
pub async fn create_custom_terminal(
    app: AppHandle,
    name: String,
    path: String,
    template: String,
) -> Result<Value, String> {
    let config_dir = plugin_config_dir(&app)?;
    PluginService::create_custom_terminal(&app, &config_dir, &name, &path, &template)
}
