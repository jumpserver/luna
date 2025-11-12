use crate::service::favorite::FavoriteService;
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn set_favorite(app: AppHandle, site: String, cookie_header: String, asset_id: String) {
    let favorite_service = FavoriteService::new(site, cookie_header, asset_id);
    let favorite_data = favorite_service.favorite().await;

    if !favorite_data.success {
        let _ = app.emit("set-favorite-failure", json!({ "status": "failed" }));
        return;
    }

    let _ = app.emit("set-favorite-success", json!({ "status": "success" }));
}
