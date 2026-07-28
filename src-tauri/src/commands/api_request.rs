use crate::api::{request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequest {
    pub method: String,
    pub path: String,
    pub query: Option<Value>,
    pub body: Option<Value>,
    pub org_id: Option<String>,
}

#[tauri::command]
pub async fn api_request(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    request: ApiRequest,
) -> Result<Value, String> {
    let mut context = fresh_api_context(&app, &session).await?;
    if let Some(org_id) = request.org_id.clone() {
        context.org_id = org_id;
    }
    let api = ApiRequestClient::from_session(&context).map_err(|error| error.to_string())?;
    let method = Method::from_bytes(request.method.as_bytes())
        .map_err(|error| format!("invalid api method: {}", error))?;
    let url = api.endpoint(&request.path);
    let response = api
        .request_json_with_response(method, &url, request.query.as_ref(), request.body.as_ref())
        .await;

    if !response.success {
        return Err(format!(
            "api request failed: status={}, body={}",
            response.status, response.data
        ));
    }

    if response.data.trim().is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str(&response.data)
        .map_err(|error| format!("parse api response failed: {}", error))
}
