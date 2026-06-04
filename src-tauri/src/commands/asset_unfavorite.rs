use crate::commands::auth::ensure_fresh_token;
use crate::service::asset_favorite::FavoriteService;
use log::info;
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn unfavorite(
    app: AppHandle,
    site: String,
    bearer_token: String,
    org_id: String,
    asset_id: String,
) {
    let bearer = match ensure_fresh_token(&app, &site, Some(&bearer_token)).await {
        Ok(b) => b,
        Err(_) => return,
    };
    let favorite_service = match FavoriteService::new(site, bearer, org_id, asset_id) {
        Ok(service) => service,
        Err(error) => {
            let _ = app.emit(
                "unfavorite-failure",
                json!({ "status": "failed", "error": error.to_string() }),
            );
            return;
        }
    };
    let result = favorite_service.unfavorite().await;

    info!("result {:?}", result);

    if !result.success {
        let _ = app.emit("unfavorite-failure", json!({ "status": "failed" }));
        return;
    }

    let _ = app.emit("unfavorite-success", json!({ "status": "success" }));
}
