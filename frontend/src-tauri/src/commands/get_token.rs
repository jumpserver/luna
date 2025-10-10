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
        // Parse token_data.data as JSON to extract the "id" field
        let data_json: Value =
            from_str(&token_data.data).expect("Failed to parse token_data.data as JSON");
        let id = data_json
            .get("id")
            .expect("No 'id' field in token_data.data")
            .as_str()
            .expect("'id' field is not a string");
        let url_data = token_service.get_local_client_url(id.to_string()).await;
        log::info!("get_connect_token success: {:?}", url_data);
        let _ = app.emit(
            "get-token-success",
            json!({ "status": url_data.status, "data": from_str::<Value>(&url_data.data).unwrap() }),
        );
    } else {
        let _ = app.emit("get-token-failure", json!({ "status": token_data.status }));
    }
}
