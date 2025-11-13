use crate::service::setting::SettingService;
use log::{error, info};
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn get_setting(app: AppHandle, site: String, cookie_header: String) {
    let setting_service = SettingService::new(site, cookie_header);
    let setting_data = setting_service.get_setting().await;

    if !setting_data.success {
        error!("获取 Setting 数据失败");
        
        let _ = app.emit(
            "get-setting-failure",
            json!({ "status": setting_data.status }),
        );
        return;
    }

    info!("获取 Setting 数据成功");

    let _ = app.emit(
        "get-setting-success",
        json!({ "status": setting_data.status, "data": setting_data.data }),
    );
}
