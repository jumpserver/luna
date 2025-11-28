use crate::utils::token_store_path;
use log::{error, warn};
use oauth2::{
    basic::BasicClient, reqwest, ClientId, RefreshToken, RevocationUrl, StandardRevocableToken,
};
use tauri::AppHandle;
use tauri_plugin_store::StoreBuilder;

#[tauri::command]
pub async fn logout(app: AppHandle, _name: String, site: String) -> Result<(), String> {
    if let Err(e) = revoke_and_clear_tokens(&app, &site).await {
        warn!("revoke token failed: {}", e);
    }

    Ok(())
}

async fn revoke_and_clear_tokens(app: &AppHandle, site: &str) -> anyhow::Result<()> {
    let path = token_store_path(app);
    let store = StoreBuilder::new(app, path.clone()).build()?;

    if let Some(entry) = store.get(site) {
        if let Some(refresh) = entry
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
        {
            let client = BasicClient::new(ClientId::new(String::from(
                "FkkXFf0wPelYPIbvf0VElkZtyrw8TWIcyqakDgni",
            )))
            .set_revocation_url(RevocationUrl::new(format!(
                "{}/core/o/revoke_token/",
                site
            ))?);

            let http_client = reqwest::Client::new();
            let req = client
                .revoke_token(StandardRevocableToken::RefreshToken(RefreshToken::new(
                    refresh,
                )))
                .map_err(|e| anyhow::anyhow!("build revocation request failed: {}", e))?;

            if let Err(e) = req.request_async(&http_client).await {
                error!("revocation request failed: {}", e);
            }
        }
        store.delete(site);
        store.save()?;
    }

    Ok(())
}
