use crate::{
    api::session::{ApiSessionContext, ApiSessionStore},
    service::oauth::ensure_fresh_token,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn set_api_session(
    state: State<'_, ApiSessionStore>,
    session_key: String,
    origin: String,
    bearer_token: String,
    org_id: String,
) {
    state.set_current_session(session_key, origin, bearer_token, org_id)
}

#[tauri::command]
pub fn set_api_org(state: State<'_, ApiSessionStore>, org_id: String) -> Result<(), String> {
    state.set_current_org(org_id)
}

pub(crate) async fn fresh_api_context(
    _app: &AppHandle,
    state: &ApiSessionStore,
) -> Result<ApiSessionContext, String> {
    let mut context = state
        .current_context()
        .ok_or_else(|| "missing current api session".to_string())?;

    let bearer = ensure_fresh_token(&context.origin, Some(&context.bearer_token))
        .await
        .map_err(|error| error.to_string())?;

    state.update_current_bearer_token(bearer.clone())?;
    context.bearer_token = bearer;

    Ok(context)
}
