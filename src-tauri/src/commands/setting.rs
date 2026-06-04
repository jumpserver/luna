use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use crate::service::setting::SettingService;
use log::{error, info};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn get_setting(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
) -> Result<(), String> {
    let context = match fresh_api_context(&app, &session).await {
        Ok(context) => context,
        Err(e) => {
            let _ = app.emit(
                "get-setting-failure",
                json!({ "status": 401, "error": e.to_string() }),
            );
            return Ok(());
        }
    };

    let api = match ApiRequestClient::from_session(&context) {
        Ok(api) => api,
        Err(error) => {
            let _ = app.emit(
                "get-setting-failure",
                json!({ "status": 0, "error": error.to_string() }),
            );
            return Ok(());
        }
    };
    let setting_service = SettingService::new(api);
    let setting_data = setting_service.get_setting().await;

    if !setting_data.success {
        error!("获取 Setting 数据失败");

        let _ = app.emit(
            "get-setting-failure",
            json!({ "status": setting_data.status }),
        );
        return Ok(());
    }

    info!("获取 Setting 数据成功");

    let _ = app.emit(
        "get-setting-success",
        json!({ "status": setting_data.status, "data": setting_data.data }),
    );

    Ok(())
}
