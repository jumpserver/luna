use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use crate::service::asset::AssetService;
use log::info;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn rename(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    asset_id: String,
    name: String,
) -> Result<(), String> {
    info!("asset_id: {}, name: {}", asset_id, name);

    let context = match fresh_api_context(&app, &session).await {
        Ok(context) => context,
        Err(_) => return Ok(()),
    };

    let api = match ApiRequestClient::from_session(&context) {
        Ok(api) => api,
        Err(error) => {
            let _ = app.emit(
                "rename-error",
                json!({
                  "success": false,
                  "status": 0,
                  "data": error.to_string(),
                }),
            );
            return Ok(());
        }
    };
    let rename_service = AssetService::new(api);
    let result = rename_service
        .rename(&asset_id, &name, &context.org_id)
        .await;

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

        return Ok(());
    }

    let _ = app.emit(
        "rename-success",
        json!({
          "success": true,
          "status": result.status,
          "data": result.data,
        }),
    );

    Ok(())
}
