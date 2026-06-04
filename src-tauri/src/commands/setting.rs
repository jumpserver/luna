use crate::commands::auth::ensure_fresh_token;
use crate::service::setting::SettingService;
use log::{error, info};
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn get_setting(app: AppHandle, site: String, bearer_token: String, org_id: String) {
    let bearer = match ensure_fresh_token(&app, &site, Some(&bearer_token)).await {
        Ok(b) => b,
        Err(e) => {
            let _ = app.emit(
                "get-setting-failure",
                json!({ "status": 401, "error": e.to_string() }),
            );
            return;
        }
    };

    let setting_service = match SettingService::new(site, bearer, org_id) {
        Ok(service) => service,
        Err(error) => {
            let _ = app.emit(
                "get-setting-failure",
                json!({ "status": 0, "error": error.to_string() }),
            );
            return;
        }
    };
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
