use crate::service::favorite::FavoriteService;
use log::info;
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn unfavorite(app: AppHandle, site: String, cookie_header: String, asset_id: String) {
    let favorite_service = FavoriteService::new(site, cookie_header, asset_id);
    let result = favorite_service.unfavorite().await;

    info!("result {:?}", result);

    if !result.success {
        let _ = app.emit("unfavorite-failure", json!({ "status": "failed" }));
        return;
    }

    let _ = app.emit("unfavorite-success", json!({ "status": "success" }));
}
