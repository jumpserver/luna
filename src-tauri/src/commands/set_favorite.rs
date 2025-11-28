use crate::commands::auth_login::ensure_fresh_token;
use crate::service::favorite::FavoriteService;
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn set_favorite(app: AppHandle, site: String, bearer_token: String, asset_id: String) {
    let bearer = match ensure_fresh_token(&app, &site, Some(&bearer_token)).await {
        Ok(b) => b,
        Err(_) => return,
    };
    let favorite_service = FavoriteService::new(site, bearer, asset_id);
    let favorite_data = favorite_service.favorite().await;

    if !favorite_data.success {
        let _ = app.emit("set-favorite-failure", json!({ "status": "failed" }));
        return;
    }

    let _ = app.emit("set-favorite-success", json!({ "status": "success" }));
}
