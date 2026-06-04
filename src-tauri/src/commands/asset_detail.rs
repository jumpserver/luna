use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use crate::service::asset::AssetService;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn get_asset_detail(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    asset_id: String,
) -> Result<(), String> {
    let context = match fresh_api_context(&app, &session).await {
        Ok(context) => context,
        Err(e) => {
            let _ = app.emit(
                "get-asset-detail-failure",
                json!({ "status": "401", "error": e.to_string() }),
            );
            return Ok(());
        }
    };

    let api = match ApiRequestClient::from_session(&context) {
        Ok(api) => api,
        Err(error) => {
            let _ = app.emit(
                "get-asset-detail-failure",
                json!({ "status": 0, "error": error.to_string() }),
            );
            return Ok(());
        }
    };
    let asset_service = AssetService::new(api);
    let asset_detail = asset_service.get_asset_detail(&asset_id).await;

    if !asset_detail.success {
        let _ = app.emit(
            "get-asset-detail-failure",
            json!({ "status": asset_detail.status }),
        );
        return Ok(());
    }

    let _ = app.emit(
        "get-asset-detail-success",
        json!({ "status": "success", "data": asset_detail.data, "asset_id": asset_id }),
    );

    Ok(())
}
