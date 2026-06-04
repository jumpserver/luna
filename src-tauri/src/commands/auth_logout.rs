use crate::api::{client::oauth_client, endpoint};
use crate::service::token::TokenService;
use log::{error, warn};
use oauth2::{basic::BasicClient, ClientId, RefreshToken, RevocationUrl, StandardRevocableToken};
use tauri::AppHandle;

#[tauri::command]
pub async fn logout(app: AppHandle, _name: String, site: String) -> Result<(), String> {
    if let Err(e) = revoke_and_clear_tokens(&app, &site).await {
        warn!("revoke token failed: {}", e);
    }

    Ok(())
}

async fn revoke_and_clear_tokens(_app: &AppHandle, site: &str) -> anyhow::Result<()> {
    let token_service = TokenService::new(site.to_string());

    if let Some(entry) = token_service.load().await? {
        if let Some(refresh) = entry.refresh_token {
            let client_id = entry.client_id.unwrap_or_else(|| "".to_string());

            let client = BasicClient::new(ClientId::new(client_id)).set_revocation_url(
                RevocationUrl::new(format!("{}{}", site, endpoint::oauth::REVOKE))?,
            );

            let http_client = oauth_client()?;
            let req = client
                .revoke_token(StandardRevocableToken::RefreshToken(RefreshToken::new(
                    refresh,
                )))
                .map_err(|e| anyhow::anyhow!("build revocation request failed: {}", e))?;

            if let Err(e) = req.request_async(&http_client).await {
                error!("revocation request failed: {}", e);
            }
        }
        token_service.delete().await?;
    }

    Ok(())
}
