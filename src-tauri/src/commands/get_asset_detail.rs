use crate::service::detail::DetailService;
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn get_asset_detail(
    app: AppHandle,
    site: String,
    bearer_token: String,
    asset_id: String,
) {
    let asset_service = DetailService::new(site, bearer_token, asset_id.clone());
    let asset_detail = asset_service.get_asset_detail().await;

    if !asset_detail.success {
        let _ = app.emit(
            "get-asset-detail-failure",
            json!({ "status": asset_detail.status }),
        );
        return;
    }

    let _ = app.emit(
        "get-asset-detail-success",
        json!({ "status": "success", "data": asset_detail.data, "asset_id": asset_id }),
    );
}
