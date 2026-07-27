use tauri::AppHandle;

use crate::commands::local_app_launcher::launch_local_application;

#[tauri::command]
pub fn pull_up(app: AppHandle, url: String) -> Result<(), String> {
    launch_local_application(app, url)
}
