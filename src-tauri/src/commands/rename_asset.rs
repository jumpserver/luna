use crate::service::rename::RenameService;
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

    let rename_service = RenameService::new(site, bearer_token, asset_id, name, org_id);
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
