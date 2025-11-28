use crate::service::detail::DetailService;
use crate::commands::auth_login::ensure_fresh_token;
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn get_asset_detail(
    app: AppHandle,
    site: String,
    bearer_token: String,
    asset_id: String,
) {
    let bearer = match ensure_fresh_token(&app, &site, Some(&bearer_token)).await {
        Ok(b) => b,
        Err(e) => {
            let _ = app.emit(
                "get-asset-detail-failure",
                json!({ "status": "401", "error": e.to_string() }),
            );
            return;
        }
    };

    let asset_service = DetailService::new(site, bearer, asset_id.clone());
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
