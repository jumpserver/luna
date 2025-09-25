use serde_json::Value;
use serde_json::{from_str, json};
use tauri::{AppHandle, Emitter};

use crate::service::token::{TokenRequestBody, TokenService};

#[tauri::command]
pub async fn get_connect_token(
    app: AppHandle,
    site: String,
    cookie_header: String,
    body: TokenRequestBody,
) {
    let token_service = TokenService::new(site, cookie_header, body);
    let token_data = token_service.get_connect_token().await;

    if token_data.status == 201 {
        let _ = app.emit(
            "get-token-success",
            json!({ "status": token_data.status, "data": from_str::<Value>(&token_data.data).unwrap() }),
        );
    } else {
        let _ = app.emit("get-token-failure", json!({ "status": token_data.status }));
    }
}
