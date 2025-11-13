use crate::service::asset::{AssetQuery, AssetService};
use log::{error, info};
use serde::Deserialize;
use serde_json::{from_str, json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct AssetResult {
    pub address: String,
    pub category: Category,
    pub comment: String,
    pub connectivity: Connectivity,
    pub created_by: String,
    pub date_created: String,
    pub date_verified: String,
    pub id: String,
    pub is_active: bool,
    pub labels: Vec<String>,
    pub name: String,
    pub nodes: Vec<Node>,
    pub org_id: String,
    pub org_name: String,
    pub platform: Platform,
    #[serde(rename = "type")]
    pub asset_type: AssetType,
    pub zone: Zone,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct Category {
    pub label: String,
    pub value: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct Connectivity {
    pub label: String,
    pub value: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct Node {
    pub id: String,
    pub name: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct Platform {
    pub id: i32,
    pub name: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct AssetType {
    pub label: String,
    pub value: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct Zone {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub async fn get_assets(
    app: AppHandle,
    site: String,
    cookie_header: String,
    query: AssetQuery,
    favorite: Option<bool>,
) {
    let asset_service = Arc::new(AssetService::new(site, cookie_header, query));
    let assets_data = asset_service
        .get_category_assets(favorite.unwrap_or(false))
        .await;

    info!("获取 Asset 数据成功，返回数据: {}", assets_data.data.len());

    if !assets_data.success {
        error!("获取 Asset 数据失败");
        error!("返回的 status 为 {}", assets_data.status);
        
        let _ = app.emit("get-asset-failure", json!({ "status": assets_data.status }));
        return;
    }

    // 获取 Assets 数据
    match from_str::<Value>(&assets_data.data) {
        Ok(mut json_message) => {
            // 为每个资产项添加默认的 permedAccounts 和 permedProtocols 字段
            if let Some(results) = json_message
                .get_mut("results")
                .and_then(|r| r.as_array_mut())
            {
                for item in results.iter_mut() {
                    if let Some(obj) = item.as_object_mut() {
                        // 添加默认的空数组字段
                        obj.insert("permedAccounts".to_string(), json!([]));
                        obj.insert("permedProtocols".to_string(), json!([]));
                    }
                }
            }

            // 添加调试信息
            // info!("处理后的 JSON 数据结构: {}", serde_json::to_string_pretty(&json_message).unwrap_or_default());

            let _ = app.emit(
                "get-asset-success",
                json!({
                    "status": assets_data.status,
                    "data": json_message,
                }),
            );
        }
        Err(e) => {
            error!(
                "解析资产列表 JSON 失败，返回数据不是合法 JSON 字符串: {}",
                e
            );
            let _ = app.emit("get-asset-failure", json!({ "status": assets_data.status }));
        }
    }

    // 获取 Favorite Assets
    let favorite_assets_data = asset_service.get_favorite_assets().await;

    if !favorite_assets_data.success {
        error!("获取 Favorite Assets 数据失败");
        return;
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
}
