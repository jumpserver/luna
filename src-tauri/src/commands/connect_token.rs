use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde_json::json;
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use crate::commands::client_launcher::pull_up;
use crate::service::connect::{ConnectService, TokenRequestBody};

#[derive(serde::Deserialize)]
struct KokoConnectTicketResponse {
    ticket: String,
    token_id: String,
    org_id: Option<String>,
    expires_at: String,
    expires_in: i64,
}

#[tauri::command]
pub async fn get_connect_token(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    body: TokenRequestBody,
    rdp_params: Option<HashMap<String, String>>,
    client_name: Option<String>,
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

    if token_data.status != 201 {
        let _ = app.emit(
            "get-token-failure",
            json!({ "status": token_data.status, "data": token_data.data }),
        );
        return Ok(());
    }

    let token_id = match parse_token_id(&token_data.data) {
        Ok(token_id) => token_id,
        Err(error) => {
            let _ = app.emit(
                "get-token-failure",
                json!({ "status": token_data.status, "data": error }),
            );
            return Ok(());
        }
    };

    let url_data = token_service
        .get_local_client_url(&token_id, rdp_params.as_ref())
        .await;
    log::info!(
        "get_connect_token client URL response status={}",
        url_data.status
    );

    let mut client_url = match parse_client_url(&url_data.data) {
        Ok(client_url) => client_url,
        Err(error) => {
            let _ = app.emit(
                "get-token-failure",
                json!({ "status": url_data.status, "data": error }),
            );
            return Ok(());
        }
    };

    if let Some(client_name) = client_name.filter(|name| !name.trim().is_empty()) {
        client_url = with_client_name(&client_url, &client_name).map_err(|error| {
            let _ = app.emit("pull-up-failure", json!({ "error": error.to_string() }));
            error
        })?;
    }

    if let Err(error) = pull_up(app.clone(), client_url) {
        let _ = app.emit("pull-up-failure", json!({ "error": error }));
    }

    Ok(())
}

fn with_client_name(client_url: &str, client_name: &str) -> Result<String, String> {
    let encoded = client_url
        .strip_prefix("jms2://")
        .ok_or_else(|| "invalid local client url scheme".to_string())?;
    let decoded = BASE64_STANDARD
        .decode(encoded)
        .map_err(|error| format!("decode local client url failed: {error}"))?;
    let mut payload: Value = serde_json::from_slice(&decoded)
        .map_err(|error| format!("parse local client url failed: {error}"))?;
    let object = payload
        .as_object_mut()
        .ok_or_else(|| "local client url payload must be an object".to_string())?;
    object.insert("client".to_string(), Value::String(client_name.to_string()));
    let encoded = BASE64_STANDARD.encode(
        serde_json::to_vec(&payload)
            .map_err(|error| format!("serialize local client url failed: {error}"))?,
    );
    Ok(format!("jms2://{encoded}"))
}

#[tauri::command]
pub async fn get_builtin_connect_session(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    body: TokenRequestBody,
    _rdp_params: Option<HashMap<String, String>>,
) -> Result<(), String> {
    let context = match fresh_api_context(&app, &session).await {
        Ok(context) => context,
        Err(e) => {
            let _ = app.emit(
                "get-builtin-session-failure",
                json!({ "status": 401, "data": e.to_string() }),
            );
            return Ok(());
        }
    };

    let api = match ApiRequestClient::from_session(&context) {
        Ok(api) => api,
        Err(error) => {
            let _ = app.emit(
                "get-builtin-session-failure",
                json!({ "status": 0, "data": error.to_string() }),
            );
            return Ok(());
        }
    };

    let token_service = ConnectService::new(api);
    let token_data = token_service.get_connect_token(&body).await;

    if token_data.status != 201 {
        let _ = app.emit(
            "get-builtin-session-failure",
            json!({ "status": token_data.status, "data": token_data.data }),
        );
        return Ok(());
    }

    let payload = match serde_json::from_str::<Value>(&token_data.data) {
        Ok(payload) => payload,
        Err(error) => {
            let _ = app.emit(
                "get-builtin-session-failure",
                json!({
                    "status": token_data.status,
                    "data": format!("parse token response failed: {}", error)
                }),
            );
            return Ok(());
        }
    };

    let _ = app.emit(
        "get-builtin-session-success",
        json!({
            "status": token_data.status,
            "data": payload
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn create_koko_connect_ticket(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    base_url: String,
    token_id: String,
) -> Result<Value, String> {
    let context = fresh_api_context(&app, &session).await?;

    let api = ApiRequestClient::with_origin(
        base_url.trim_end_matches('/').to_string(),
        context.bearer_token.clone(),
        context.org_id.clone(),
    )
    .map_err(|error| error.to_string())?;

    let response = api
        .post_json_with_response(
            &api.endpoint("/koko/api/connect-ticket/"),
            &json!({
                "token_id": token_id,
                "org_id": context.org_id
            }),
        )
        .await;

    if response.status != 201 {
        return Err(format!(
            "create koko connect ticket failed: status={}, body={}",
            response.status, response.data
        ));
    }

    let ticket = serde_json::from_str::<KokoConnectTicketResponse>(&response.data)
        .map_err(|error| format!("parse koko connect ticket failed: {}", error))?;

    Ok(json!({
        "ticket": ticket.ticket,
        "token_id": ticket.token_id,
        "org_id": ticket.org_id.unwrap_or(context.org_id),
        "expires_at": ticket.expires_at,
        "expires_in": ticket.expires_in
    }))
}

fn parse_token_id(data: &str) -> Result<String, String> {
    let value = serde_json::from_str::<Value>(data)
        .map_err(|error| format!("parse token response failed: {}", error))?;

    value
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "token response missing string field `id`".to_string())
}

fn parse_client_url(data: &str) -> Result<String, String> {
    let value = serde_json::from_str::<Value>(data)
        .map_err(|error| format!("parse client url response failed: {}", error))?;

    value
        .get("url")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "client url response missing string field `url`".to_string())
}
