use log::info;

use crate::service::token::{TokenRequestBody, TokenService};

#[tauri::command]
pub async fn get_connect_token(site: String, cookie_header: String, body: TokenRequestBody) {
    let token_service = TokenService::new(site, cookie_header, body);
    let token_data = token_service.get_connect_token().await;

    info!("获取连接 token 数据成功: {}", token_data.data);
}
