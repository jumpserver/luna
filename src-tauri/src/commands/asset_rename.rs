use crate::commands::auth::ensure_fresh_token;
use crate::service::asset_rename::RenameService;
use log::info;
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn rename(
    app: AppHandle,
    site: String,
    bearer_token: String,
    asset_id: String,
    name: String,
    org_id: String,
) {
    info!("asset_id: {}, name: {}", asset_id, name);

    let bearer = match ensure_fresh_token(&app, &site, Some(&bearer_token)).await {
        Ok(b) => b,
        Err(_) => return,
    };

    let rename_service = match RenameService::new(site, bearer, asset_id, name, org_id) {
        Ok(service) => service,
        Err(error) => {
            let _ = app.emit(
                "rename-error",
                json!({
                  "success": false,
                  "status": 0,
                  "data": error.to_string(),
                }),
            );
            return;
        }
    };
    let result = rename_service.rename().await;

    info!("result: {:?}", result);

    if !result.success {
        let _ = app.emit(
            "rename-error",
            json!({
              "success": false,
              "status": result.status,
              "data": result.data,
            }),
        );

        return;
    }

    let _ = app.emit(
        "rename-success",
        json!({
          "success": true,
          "status": result.status,
          "data": result.data,
        }),
    );
}
