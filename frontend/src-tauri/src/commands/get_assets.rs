use log::{error, info};
use serde_json::json;
use crate::service::asset::{AssetQuery, AssetService};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn get_assets(app: AppHandle, site: String, cookie_header:String, query: AssetQuery) {
    let asset_service = AssetService::new(site.clone(), cookie_header.clone(), query);

    let res = asset_service.get_category_assets().await;

    if res.success {
        info!("获取 Asset 数据成功");
        let _ = app.emit("get-asset-success", json!(res.data));
    } else {
        error!("获取 Asset 数据失败");
        let _ = app.emit("get-asset-failure", json!({"status": "failure"}));
    }
}
