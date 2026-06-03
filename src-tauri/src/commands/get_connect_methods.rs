use crate::commands::auth_login::ensure_fresh_token;
use crate::service::connect_methods::ConnectMethodsService;
use log::{error, info};
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn get_connect_methods(
    app: AppHandle,
    site: String,
    bearer_token: String,
    org_id: String,
) {
    let bearer = match ensure_fresh_token(&app, &site, Some(&bearer_token)).await {
        Ok(b) => b,
        Err(e) => {
            let _ = app.emit(
                "get-connect-methods-failure",
                json!({ "status": 401, "error": e.to_string() }),
            );
            return;
        }
    };
    let connect_methods_service = match ConnectMethodsService::new(site, bearer, org_id) {
        Ok(service) => service,
        Err(error) => {
            let _ = app.emit(
                "get-connect-methods-failure",
                json!({ "status": 0, "error": error.to_string() }),
            );
            return;
        }
    };
    let connect_methods_data = connect_methods_service.get_connect_methods().await;

    if !connect_methods_data.success {
        error!("获取 ConnectMethods 数据失败");

        let _ = app.emit(
            "get-connect-methods-failure",
            json!({ "status": connect_methods_data.status }),
        );
        return;
    }

    info!("获取 ConnectMethods 数据成功");

    let _ = app.emit(
        "get-connect-methods-success",
        json!({ "status": connect_methods_data.status, "data": connect_methods_data.data }),
    );
}
