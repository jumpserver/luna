use anyhow::Result;
use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "JumpServerClient Safe Storage";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenRecord {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub client_id: Option<String>,
}

pub struct TokenService {
    site: String,
}

impl TokenService {
    pub fn new(site: impl Into<String>) -> Self {
        Self { site: site.into() }
    }

    pub async fn persist(
        &self,
        access: &str,
        refresh: Option<&str>,
        expires_at: Option<i64>,
        client_id: Option<&str>,
    ) -> Result<()> {
        let record = TokenRecord {
            access_token: access.to_string(),
            refresh_token: refresh.map(|r| r.to_string()),
            expires_at,
            client_id: client_id.map(|c| c.to_string()),
        };
        let payload = serde_json::to_string(&record)?;
        let site = self.site.clone();

        tokio::task::spawn_blocking(move || -> Result<()> {
            Entry::new(SERVICE_NAME, site.as_str())?.set_password(&payload)?;
            Ok(())
        })
        .await??;

        Ok(())
    }

    pub async fn load(&self) -> Result<Option<TokenRecord>> {
        let site = self.site.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<TokenRecord>> {
            let entry = Entry::new(SERVICE_NAME, site.as_str())?;
            match entry.get_password() {
                Ok(val) => Ok(Some(serde_json::from_str(&val)?)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(e) => Err(e.into()),
            }
        })
        .await?
    }

    pub async fn delete(&self) -> Result<()> {
        let site = self.site.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            if let Ok(entry) = Entry::new(SERVICE_NAME, site.as_str()) {
                let _ = entry.delete_credential();
            }
            Ok(())
        })
        .await??;
        Ok(())
    }
}
