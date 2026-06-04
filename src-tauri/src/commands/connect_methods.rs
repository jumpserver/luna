use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use crate::service::connect::ConnectService;
use log::{error, info};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn get_connect_methods(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
) -> Result<(), String> {
    let context = match fresh_api_context(&app, &session).await {
        Ok(context) => context,
        Err(e) => {
            let _ = app.emit(
                "get-connect-methods-failure",
                json!({ "status": 401, "error": e.to_string() }),
            );
            return Ok(());
        }
    };
    let api = match ApiRequestClient::from_session(&context) {
        Ok(api) => api,
        Err(error) => {
            let _ = app.emit(
                "get-connect-methods-failure",
                json!({ "status": 0, "error": error.to_string() }),
            );
            return Ok(());
        }
    };
    let connect_methods_service = ConnectService::new(api);
    let connect_methods_data = connect_methods_service.get_connect_methods().await;

    if !connect_methods_data.success {
        error!("获取 ConnectMethods 数据失败");

        let _ = app.emit(
            "get-connect-methods-failure",
            json!({ "status": connect_methods_data.status }),
        );
        return Ok(());
    }

    info!("获取 ConnectMethods 数据成功");

    let _ = app.emit(
        "get-connect-methods-success",
        json!({ "status": connect_methods_data.status, "data": connect_methods_data.data }),
    );

    Ok(())
}
