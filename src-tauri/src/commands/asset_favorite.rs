use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use crate::service::asset_favorite::FavoriteService;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn set_favorite(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    asset_id: String,
) -> Result<(), String> {
    let context = match fresh_api_context(&app, &session).await {
        Ok(context) => context,
        Err(_) => return Ok(()),
    };
    let api = match ApiRequestClient::from_session(&context) {
        Ok(api) => api,
        Err(error) => {
            let _ = app.emit(
                "set-favorite-failure",
                json!({ "status": "failed", "error": error.to_string() }),
            );
            return Ok(());
        }
    };
    let favorite_service = FavoriteService::new(api, asset_id);
    let favorite_data = favorite_service.favorite().await;

    if !favorite_data.success {
        let _ = app.emit("set-favorite-failure", json!({ "status": "failed" }));
        return Ok(());
    }

    let _ = app.emit("set-favorite-success", json!({ "status": "success" }));
    Ok(())
}
