use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use crate::service::asset::AssetService;
use log::info;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn unfavorite(
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
                "unfavorite-failure",
                json!({ "status": "failed", "error": error.to_string() }),
            );
            return Ok(());
        }
    };
    let favorite_service = AssetService::new(api);
    let result = favorite_service.unfavorite(&asset_id).await;

    info!("result {:?}", result);

    if !result.success {
        let _ = app.emit("unfavorite-failure", json!({ "status": "failed" }));
        return Ok(());
    }

    let _ = app.emit("unfavorite-success", json!({ "status": "success" }));
    Ok(())
}
