use log::{error, info};
use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use serde_json::{from_str, json, Value};
use crate::service::asset::{AssetQuery, AssetService};

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
pub async fn get_assets(app: AppHandle, site: String, cookie_header:String, query: AssetQuery) {
    let asset_service = AssetService::new(site.clone(), cookie_header.clone(), query);
    let assets_data = asset_service.get_category_assets().await;
    // 尽量避免 unwrap 导致 panic，这里仅在需要时解析以便后续逻辑扩展
    if let Ok(json_message) = from_str::<Value>(&assets_data.data) {
        if let Some(results) = json_message.get("results") {
            if let Some(arr) = results.as_array() {
                for item in arr {
                    // 如果后续需要做单条资产处理，避免强反序列化导致 panic，
                    // 仅提取必要字段，例如 id。
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        let detail = asset_service.get_asset_details(id.to_string()).await;

                        info!("Details {}", detail.data);
                        // if detail.success {
                        //     info!("detail message {:?}", detail);
                        // } else {
                        //     error!("获取资产详情失败: {} (status: {})", id, detail.status);
                        // }
                    } else {
                        // 非预期的数据结构，记录日志但不中断流程
                        info!("资产条目缺少字符串 id 字段或结构不匹配");
                    }
                }
            }
        }
    } else {
        error!("解析资产列表 JSON 失败，返回数据不是合法 JSON 字符串");
    }

    if assets_data.success {
        info!("获取 Asset 数据成功");
        let _ = app.emit("get-asset-success", json!(assets_data.data));
    } else {
        error!("获取 Asset 数据失败");
        let _ = app.emit("get-asset-failure", json!({"status": "failure"}));
    }
}
