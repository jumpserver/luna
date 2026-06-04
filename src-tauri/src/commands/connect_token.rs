use serde_json::Value;
use serde_json::{from_str, json};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use crate::commands::client_launcher::pull_up;
use crate::service::connect::{ConnectService, TokenRequestBody};

#[tauri::command]
pub async fn get_connect_token(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    body: TokenRequestBody,
    rdp_params: Option<HashMap<String, String>>,
) -> Result<(), String> {
    let context = match fresh_api_context(&app, &session).await {
        Ok(context) => context,
        Err(e) => {
            let _ = app.emit(
                "get-token-failure",
                json!({ "status": 401, "data": e.to_string() }),
            );
            return Ok(());
        }
    };

    let api = match ApiRequestClient::from_session(&context) {
        Ok(api) => api,
        Err(error) => {
            let _ = app.emit(
                "get-token-failure",
                json!({ "status": 0, "data": error.to_string() }),
            );
            return Ok(());
        }
    };
    let token_service = ConnectService::new(api);
    let token_data = token_service.get_connect_token(&body).await;

    if token_data.status == 201 {
        // Parse token_data.data as JSON to extract the "id" field
        let data_json: Value =
            from_str(&token_data.data).expect("Failed to parse token_data.data as JSON");
        let id = data_json
            .get("id")
            .expect("No 'id' field in token_data.data")
            .as_str()
            .expect("'id' field is not a string");
        let url_data = token_service
            .get_local_client_url(id, rdp_params.as_ref())
            .await;
        log::info!("get_connect_token success: {:?}", url_data);
        let url_json: Value =
            from_str(&url_data.data).expect("Failed to parse url_data.data as JSON");
        // let _ = app.emit(
        //     "get-token-success",
        //     json!({ "status": url_data.status, "data": from_str::<Value>(&url_data.data).unwrap() }),
        // );
        if let Err(e) = pull_up(
            app.clone(),
            url_json.get("url").unwrap().as_str().unwrap().to_string(),
        ) {
            let _ = app.emit("pull-up-failure", json!({ "error": e }));
        }
    } else {
        let _ = app.emit(
            "get-token-failure",
            json!({ "status": token_data.status, "data": token_data.data }),
        );
    }

    Ok(())
}
