use crate::service::asset::{AssetQuery, AssetService};
use log::error;
use serde::Deserialize;
use serde_json::{from_str, json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinSet;

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
pub async fn get_assets(app: AppHandle, site: String, cookie_header: String, query: AssetQuery) {
    let asset_service = Arc::new(AssetService::new(site, cookie_header, query));
    let assets_data = asset_service.get_category_assets().await;

    // 请求失败则直接返回失败事件
    if !assets_data.success {
        error!("获取 Asset 数据失败");
        let _ = app.emit("get-asset-failure", json!({ "status": assets_data.status }));
        return;
    }

    // 解析服务返回的 JSON 字符串
    match from_str::<Value>(&assets_data.data) {
        Ok(mut json_message) => {
            if let Some(results) = json_message
                .get_mut("results")
                .and_then(|r| r.as_array_mut())
            {
                // 收集需要查询详情的 ID
                let ids: Vec<String> = results
                    .iter()
                    .filter_map(|item| {
                        item.get("id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                    .collect();

                // 控制并发数量，避免过多同时请求
                let concurrency = 8usize;
                let mut ids_iter = ids.into_iter();
                let mut set: JoinSet<(String, crate::commands::requests::ApiResponse)> =
                    JoinSet::new();

                // 预热并发窗口
                for _ in 0..concurrency {
                    if let Some(id) = ids_iter.next() {
                        let svc = Arc::clone(&asset_service);
                        set.spawn(async move { (id.clone(), svc.get_asset_details(id).await) });
                    } else {
                        break;
                    }
                }

                let mut extras_map: HashMap<String, Value> = HashMap::new();

                // 消费已完成的任务，并持续补位新的任务
                while let Some(joined) = set.join_next().await {
                    if let Ok((id, detail)) = joined {
                        if detail.success {
                            if let Ok(detail_json) = serde_json::from_str::<Value>(&detail.data) {
                                let mut map = serde_json::Map::new();
                                if let Some(protocols) = detail_json.get("permed_protocols") {
                                    map.insert("permed_protocols".to_string(), protocols.clone());
                                }
                                if let Some(accounts) = detail_json.get("permed_accounts") {
                                    map.insert("permed_accounts".to_string(), accounts.clone());
                                }
                                if !map.is_empty() {
                                    extras_map.insert(id, Value::Object(map));
                                }
                            }
                        } else {
                            error!("获取资产详情失败: {} (status: {})", id, detail.status);
                        }
                    }

                    if let Some(next_id) = ids_iter.next() {
                        let svc = Arc::clone(&asset_service);
                        set.spawn(async move {
                            (next_id.clone(), svc.get_asset_details(next_id).await)
                        });
                    }
                }

                // 合并详情字段到 results
                for item in results.iter_mut() {
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        if let Some(extras) = extras_map.get(id) {
                            if let (Some(obj), Value::Object(extra_obj)) =
                                (item.as_object_mut(), extras)
                            {
                                for (k, v) in extra_obj {
                                    obj.insert(k.clone(), v.clone());
                                }
                            }
                        }
                    }
                }
            }

            let _ = app.emit(
                "get-asset-success",
                json!({
                    "status": assets_data.status,
                    "data": json_message,
                }),
            );
            return;
        }
        Err(_) => {
            error!("解析资产列表 JSON 失败，返回数据不是合法 JSON 字符串");
            let _ = app.emit("get-asset-failure", json!({ "status": assets_data.status }));
            return;
        }
    }
}
