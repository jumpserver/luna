use anyhow::Result;
use keyring_core::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[cfg(not(all(debug_assertions, target_os = "macos")))]
use std::sync::OnceLock;
#[cfg(all(debug_assertions, target_os = "macos"))]
use std::{collections::HashMap, fs, os::unix::fs::PermissionsExt, path::PathBuf};

const SERVICE_NAME: &str = "com.jumpserver.client.auth";
static TOKEN_STORE_LOCK: Mutex<()> = Mutex::new(());
#[cfg(not(all(debug_assertions, target_os = "macos")))]
static TOKEN_STORE_INIT: OnceLock<std::result::Result<(), String>> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenRecord {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub client_id: Option<String>,
}

pub struct TokenService {
    token_key: String,
}

#[cfg(all(debug_assertions, target_os = "macos"))]
fn configure_token_store() -> std::result::Result<(), String> {
    let home = std::env::var_os("HOME").ok_or("HOME is not set")?;
    let directory = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("JumpServerClient");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;

    let backing_file = directory.join("dev-keyring.ron");
    let backing_file = backing_file
        .to_str()
        .ok_or("Development credential path is not valid UTF-8")?;
    let config = HashMap::from([("backing-file", backing_file)]);
    keyring::use_sample_store(&config).map_err(|error| error.to_string())
}

#[cfg(not(all(debug_assertions, target_os = "macos")))]
fn configure_token_store() -> std::result::Result<(), String> {
    keyring::use_native_store(false).map_err(|error| error.to_string())
}

fn token_entry(token_key: &str) -> Result<Entry> {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    configure_token_store().map_err(anyhow::Error::msg)?;

    #[cfg(not(all(debug_assertions, target_os = "macos")))]
    TOKEN_STORE_INIT
        .get_or_init(configure_token_store)
        .as_ref()
        .map_err(|error| anyhow::anyhow!(error.clone()))?;

    Ok(Entry::new(SERVICE_NAME, token_key)?)
}

#[cfg(all(debug_assertions, target_os = "macos"))]
fn release_token_store() {
    keyring::release_store();
}

#[cfg(not(all(debug_assertions, target_os = "macos")))]
fn release_token_store() {}

impl TokenService {
    pub fn new(token_key: impl Into<String>) -> Self {
        Self {
            token_key: token_key.into(),
        }
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
        let token_key = self.token_key.clone();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let _guard = TOKEN_STORE_LOCK
                .lock()
                .map_err(|error| anyhow::anyhow!("Token store lock failed: {error}"))?;
            let result = token_entry(&token_key)?.set_password(&payload);
            release_token_store();
            result?;
            Ok(())
        })
        .await??;

        Ok(())
    }

    pub async fn load(&self) -> Result<Option<TokenRecord>> {
        let token_key = self.token_key.clone();
        tokio::task::spawn_blocking(move || -> Result<Option<TokenRecord>> {
            let _guard = TOKEN_STORE_LOCK
                .lock()
                .map_err(|error| anyhow::anyhow!("Token store lock failed: {error}"))?;
            let entry = token_entry(&token_key)?;
            let result = match entry.get_password() {
                Ok(val) => Ok(Some(serde_json::from_str(&val)?)),
                Err(KeyringError::NoEntry) => Ok(None),
                Err(e) => Err(e.into()),
            };
            drop(entry);
            release_token_store();
            result
        })
        .await?
    }

    pub async fn delete(&self) -> Result<()> {
        let token_key = self.token_key.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let _guard = TOKEN_STORE_LOCK
                .lock()
                .map_err(|error| anyhow::anyhow!("Token store lock failed: {error}"))?;
            if let Ok(entry) = token_entry(&token_key) {
                let _ = entry.delete_credential();
                drop(entry);
                release_token_store();
            }
            Ok(())
        })
        .await??;
        Ok(())
    }
}
