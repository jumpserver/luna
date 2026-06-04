use crate::api::{
    request::ApiRequestClient,
    session::{ApiSessionContext, ApiSessionStore},
};
use crate::commands::api_session::fresh_api_context;
use crate::service::asset::{AssetQuery, AssetService};
use log::{error, info};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

async fn load_asset_service(
    app: &AppHandle,
    session: &ApiSessionStore,
) -> Result<(ApiSessionContext, AssetService), String> {
    let context = fresh_api_context(app, session).await?;
    let api = ApiRequestClient::from_session(&context).map_err(|error| error.to_string())?;

    Ok((context, AssetService::new(api)))
}

fn append_asset_defaults(data: &str) -> Result<Value, String> {
    let mut value = serde_json::from_str::<Value>(data)
        .map_err(|error| format!("parse asset list response failed: {}", error))?;

    if let Some(results) = value.get_mut("results").and_then(Value::as_array_mut) {
        for item in results {
            if let Some(object) = item.as_object_mut() {
                object.insert("permedAccounts".to_string(), json!([]));
                object.insert("permedProtocols".to_string(), json!([]));
            }
        }
    }

    Ok(value)
}

#[tauri::command]
pub async fn get_assets(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    mut query: AssetQuery,
    favorite: Option<bool>,
) -> Result<(), String> {
    let (context, asset_service) = match load_asset_service(&app, &session).await {
        Ok(result) => result,
        Err(error) => {
            error!("load asset service failed: {}", error);
            let _ = app.emit("get-asset-failure", json!({ "status": 401 }));
            return Ok(());
        }
    };

    query.oid = context.org_id.clone();

    let assets_data = asset_service
        .get_category_assets(&query, favorite.unwrap_or(false))
        .await;

    if !assets_data.success {
        error!("获取 Asset 数据失败");
        let _ = app.emit("get-asset-failure", json!({ "status": assets_data.status }));
        return Ok(());
    }

    match append_asset_defaults(&assets_data.data) {
        Ok(data) => {
            let _ = app.emit(
                "get-asset-success",
                json!({
                    "status": assets_data.status,
                    "data": data,
                }),
            );
        }
        Err(error) => {
            error!("解析资产列表 JSON 失败: {}", error);
            let _ = app.emit("get-asset-failure", json!({ "status": assets_data.status }));
            return Ok(());
        }
    }

    let favorite_assets_data = asset_service.get_favorite_assets().await;

    if !favorite_assets_data.success {
        error!("获取 Favorite Assets 数据失败");
        return Ok(());
    }

    info!(
        "获取 Favorite Assets 数据成功，返回数据: {}",
        favorite_assets_data.data
    );

    let _ = app.emit(
        "get-favorite-assets-success",
        json!({
            "status": favorite_assets_data.status,
            "data": favorite_assets_data.data,
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn get_asset_detail(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    asset_id: String,
) -> Result<(), String> {
    let (_, asset_service) = match load_asset_service(&app, &session).await {
        Ok(result) => result,
        Err(error) => {
            let _ = app.emit(
                "get-asset-detail-failure",
                json!({ "status": 401, "error": error }),
            );
            return Ok(());
        }
    };

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

#[tauri::command]
pub async fn set_favorite(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    asset_id: String,
) -> Result<(), String> {
    let (_, asset_service) = match load_asset_service(&app, &session).await {
        Ok(result) => result,
        Err(error) => {
            let _ = app.emit(
                "set-favorite-failure",
                json!({ "status": "failed", "error": error }),
            );
            return Ok(());
        }
    };

    let favorite_data = asset_service.favorite(&asset_id).await;

    if !favorite_data.success {
        let _ = app.emit("set-favorite-failure", json!({ "status": "failed" }));
        return Ok(());
    }

    let _ = app.emit("set-favorite-success", json!({ "status": "success" }));
    Ok(())
}

#[tauri::command]
pub async fn unfavorite(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    asset_id: String,
) -> Result<(), String> {
    let (_, asset_service) = match load_asset_service(&app, &session).await {
        Ok(result) => result,
        Err(error) => {
            let _ = app.emit(
                "unfavorite-failure",
                json!({ "status": "failed", "error": error }),
            );
            return Ok(());
        }
    };

    let result = asset_service.unfavorite(&asset_id).await;

    info!("result {:?}", result);

    if !result.success {
        let _ = app.emit("unfavorite-failure", json!({ "status": "failed" }));
        return Ok(());
    }

    let _ = app.emit("unfavorite-success", json!({ "status": "success" }));
    Ok(())
}

#[tauri::command]
pub async fn rename(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    asset_id: String,
    name: String,
) -> Result<(), String> {
    info!("asset_id: {}, name: {}", asset_id, name);

    let (context, asset_service) = match load_asset_service(&app, &session).await {
        Ok(result) => result,
        Err(error) => {
            let _ = app.emit(
                "rename-error",
                json!({
                    "success": false,
                    "status": 0,
                    "data": error,
                }),
            );
            return Ok(());
        }
    };

    let result = asset_service
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
