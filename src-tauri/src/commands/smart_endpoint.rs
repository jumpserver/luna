use serde::Deserialize;
use tauri::{AppHandle, State};
use url::Url;

use crate::api::{endpoint, request::ApiRequestClient, session::ApiSessionStore};
use crate::commands::api_session::fresh_api_context;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartEndpointQuery {
    protocol: String,
    asset_id: Option<String>,
    token: Option<String>,
}

#[tauri::command]
pub async fn get_smart_endpoint(
    app: AppHandle,
    session: State<'_, ApiSessionStore>,
    query: SmartEndpointQuery,
) -> Result<serde_json::Value, String> {
    let context = fresh_api_context(&app, &session)
        .await
        .map_err(|error| error.to_string())?;
    let api = ApiRequestClient::from_session(&context).map_err(|error| error.to_string())?;
    let mut url = api.endpoint(endpoint::terminal::SMART_ENDPOINT);

    if let Ok(mut parsed) = Url::parse(&url) {
        {
            let mut pairs = parsed.query_pairs_mut();
            pairs.append_pair("protocol", &query.protocol);

            if let Some(asset_id) = query.asset_id.as_deref().filter(|value| !value.is_empty()) {
                pairs.append_pair("asset_id", asset_id);
            } else if let Some(token) = query.token.as_deref().filter(|value| !value.is_empty()) {
                pairs.append_pair("token", token);
            }
        }

        url = parsed.to_string();
    }

    let response = api.get_with_response(&url).await;

    if !(200..300).contains(&response.status) {
        return Err(response.data);
    }

    serde_json::from_str::<serde_json::Value>(&response.data)
        .map_err(|error| format!("parse smart endpoint failed: {}", error))
}
