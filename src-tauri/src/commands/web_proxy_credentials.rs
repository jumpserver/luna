use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use hkdf::Hkdf;
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::time::Duration;
use url::Url;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroize;

const CREDENTIAL_PATH: &str = "/_jumpserver/web-sessions/";
const CREDENTIAL_KDF_INFO: &[u8] = b"jumpserver-web-autofill-v1";
const X25519_SPKI_PREFIX: &[u8] = &[
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
];

#[derive(Debug, Deserialize)]
struct CreateCredentialResponse {
    id: Option<String>,
    access_token: Option<String>,
    target_url: String,
    origin: String,
    autofill_available: bool,
    username_selector: Option<String>,
    password_selector: Option<String>,
    submit_selector: Option<String>,
    server_public_key: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ReleasedCredentialResponse {
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Deserialize, Zeroize)]
#[zeroize(drop)]
pub(crate) struct WebCredentials {
    pub(crate) username: String,
    pub(crate) password: String,
}

pub(crate) struct WebCredentialSession {
    id: String,
    access_token: String,
    endpoint: Url,
    origin: String,
    username_selector: String,
    password_selector: String,
    submit_selector: String,
    server_public_key: [u8; 32],
    private_key: StaticSecret,
}

impl Drop for WebCredentialSession {
    fn drop(&mut self) {
        self.access_token.zeroize();
    }
}

#[derive(Serialize)]
struct CreateCredentialRequest<'a> {
    token_id: &'a str,
    token_value: &'a str,
    client_public_key: String,
}

impl WebCredentialSession {
    pub(crate) fn origin(&self) -> &str {
        &self.origin
    }

    pub(crate) fn selectors(&self) -> (&str, &str, &str) {
        (
            &self.username_selector,
            &self.password_selector,
            &self.submit_selector,
        )
    }

    pub(crate) async fn release(&mut self, current_url: &Url) -> Result<WebCredentials, String> {
        if normalized_origin(current_url)? != self.origin {
            return Err("页面 origin 与代填会话不匹配".to_string());
        }
        let url = self
            .endpoint
            .join(&format!("{}/credentials", self.id))
            .map_err(|error| error.to_string())?;
        let client = credential_client()?;
        let response = client
            .post(url)
            .bearer_auth(&self.access_token)
            .json(&serde_json::json!({ "origin": self.origin }))
            .send()
            .await
            .map_err(|error| format!("领取 Web 凭据失败: {error}"))?;
        self.access_token.zeroize();
        if !response.status().is_success() {
            return Err(format!("领取 Web 凭据失败: HTTP {}", response.status()));
        }
        let released: ReleasedCredentialResponse = response
            .json()
            .await
            .map_err(|error| format!("解析 Web 凭据失败: {error}"))?;
        self.decrypt(released)
    }

    fn decrypt(&self, released: ReleasedCredentialResponse) -> Result<WebCredentials, String> {
        let server_key = PublicKey::from(self.server_public_key);
        let mut shared_secret = self.private_key.diffie_hellman(&server_key).to_bytes();
        let hkdf = Hkdf::<Sha256>::new(None, &shared_secret);
        let mut key = [0u8; 32];
        hkdf.expand(CREDENTIAL_KDF_INFO, &mut key)
            .map_err(|_| "派生 Web 凭据密钥失败".to_string())?;
        shared_secret.zeroize();

        let nonce = BASE64
            .decode(released.nonce)
            .map_err(|_| "Web 凭据 nonce 无效".to_string())?;
        let ciphertext = BASE64
            .decode(released.ciphertext)
            .map_err(|_| "Web 凭据密文无效".to_string())?;
        if nonce.len() != 12 || ciphertext.len() <= 16 {
            key.zeroize();
            return Err("Web 凭据密文格式无效".to_string());
        }
        let cipher =
            Aes256Gcm::new_from_slice(&key).map_err(|_| "初始化 Web 凭据解密器失败".to_string())?;
        let aad = format!("{}\n{}", self.id, self.origin);
        let mut plaintext = cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| "Web 凭据校验失败".to_string())?;
        key.zeroize();
        let result = serde_json::from_slice(&plaintext).map_err(|_| "Web 凭据内容无效".to_string());
        plaintext.zeroize();
        result
    }
}

pub(crate) async fn create_credential_session(
    proxy_url: &Url,
    target_url: &Url,
    token_id: &str,
    token_value: &str,
) -> Result<Option<WebCredentialSession>, String> {
    if token_id.is_empty() || token_value.is_empty() {
        return Ok(None);
    }
    let private_key = StaticSecret::random_from_rng(OsRng);
    let public_key = PublicKey::from(&private_key);
    let mut spki = Vec::with_capacity(X25519_SPKI_PREFIX.len() + public_key.as_bytes().len());
    spki.extend_from_slice(X25519_SPKI_PREFIX);
    spki.extend_from_slice(public_key.as_bytes());
    let endpoint = proxy_url
        .join(CREDENTIAL_PATH)
        .map_err(|error| error.to_string())?;
    let client = credential_client()?;
    let response = client
        .post(endpoint.clone())
        .json(&CreateCredentialRequest {
            token_id,
            token_value,
            client_public_key: BASE64.encode(spki),
        })
        .send()
        .await
        .map_err(|error| format!("创建 Web 代填会话失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("创建 Web 代填会话失败: HTTP {}", response.status()));
    }
    let data: CreateCredentialResponse = response
        .json()
        .await
        .map_err(|error| format!("解析 Web 代填会话失败: {error}"))?;
    let response_target =
        Url::parse(&data.target_url).map_err(|_| "Koko 返回了无效 Website 地址".to_string())?;
    if normalized_origin(&response_target)? != normalized_origin(target_url)?
        || normalized_origin(&response_target)? != data.origin
    {
        return Err("Koko 返回的 Website origin 不匹配".to_string());
    }
    if !data.autofill_available {
        return Ok(None);
    }

    let username_selector = data.username_selector.unwrap_or_default();
    let password_selector = required_selector(data.password_selector, "密码")?;
    let submit_selector = required_selector(data.submit_selector, "提交")?;
    if !username_selector.is_empty() {
        validate_selector(&username_selector)?;
    }
    let server_public_key = parse_spki(&data.server_public_key.unwrap_or_default())?;
    Ok(Some(WebCredentialSession {
        id: required(data.id, "代填会话 ID")?,
        access_token: required(data.access_token, "代填访问令牌")?,
        endpoint,
        origin: data.origin,
        username_selector,
        password_selector,
        submit_selector,
        server_public_key,
        private_key,
    }))
}

fn credential_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .no_proxy()
        .build()
        .map_err(|error| error.to_string())
}

fn required(value: Option<String>, field: &str) -> Result<String, String> {
    value
        .filter(|item| !item.is_empty())
        .ok_or_else(|| format!("Koko 返回的{field}为空"))
}

fn required_selector(value: Option<String>, label: &str) -> Result<String, String> {
    let selector = required(value, &format!("{label}元素配置"))?;
    validate_selector(&selector)?;
    Ok(selector)
}

fn validate_selector(selector: &str) -> Result<(), String> {
    if selector.is_empty() || selector.len() > 1024 {
        return Err("Website 代填元素配置无效".to_string());
    }
    let (kind, value) = selector
        .split_once('=')
        .ok_or_else(|| "Website 代填元素配置无效".to_string())?;
    if value.trim().is_empty()
        || !matches!(
            kind.trim().to_ascii_lowercase().as_str(),
            "name" | "id" | "type" | "class_name" | "css" | "css_selector" | "xpath"
        )
    {
        return Err("Website 代填元素配置无效".to_string());
    }
    Ok(())
}

fn parse_spki(value: &str) -> Result<[u8; 32], String> {
    let der = BASE64
        .decode(value)
        .map_err(|_| "Koko Web 公钥无效".to_string())?;
    if der.len() != X25519_SPKI_PREFIX.len() + 32 || !der.starts_with(X25519_SPKI_PREFIX) {
        return Err("Koko Web 公钥格式无效".to_string());
    }
    der[X25519_SPKI_PREFIX.len()..]
        .try_into()
        .map_err(|_| "Koko Web 公钥格式无效".to_string())
}

pub(crate) fn normalized_origin(url: &Url) -> Result<String, String> {
    let host = url
        .host_str()
        .ok_or_else(|| "Website origin 无效".to_string())?
        .to_ascii_lowercase();
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Website origin 无效".to_string())?;
    let default_port =
        (url.scheme() == "http" && port == 80) || (url.scheme() == "https" && port == 443);
    let authority = if default_port {
        host
    } else {
        format!("{host}:{port}")
    };
    Ok(format!(
        "{}://{}",
        url.scheme().to_ascii_lowercase(),
        authority
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        parse_spki, validate_selector, ReleasedCredentialResponse, WebCredentialSession,
        CREDENTIAL_KDF_INFO, CREDENTIAL_PATH, X25519_SPKI_PREFIX,
    };
    use aes_gcm::{
        aead::{Aead, KeyInit, Payload},
        Aes256Gcm, Nonce,
    };
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use hkdf::Hkdf;
    use rand_core::OsRng;
    use sha2::Sha256;
    use url::Url;
    use x25519_dalek::{PublicKey, StaticSecret};

    #[test]
    fn validates_supported_selectors_and_x25519_spki() {
        assert!(validate_selector("id=password").is_ok());
        assert!(validate_selector("css=input[type=password]").is_ok());
        assert!(validate_selector("javascript=alert(1)").is_err());
        let mut spki = X25519_SPKI_PREFIX.to_vec();
        spki.extend_from_slice(&[7u8; 32]);
        assert_eq!(parse_spki(&BASE64.encode(spki)).unwrap(), [7u8; 32]);
    }

    #[test]
    fn decrypts_koko_compatible_one_time_envelope() {
        let client_key = StaticSecret::random_from_rng(OsRng);
        let server_key = StaticSecret::random_from_rng(OsRng);
        let server_public = PublicKey::from(&server_key);
        let shared = server_key.diffie_hellman(&PublicKey::from(&client_key));
        let hkdf = Hkdf::<Sha256>::new(None, shared.as_bytes());
        let mut key = [0u8; 32];
        hkdf.expand(CREDENTIAL_KDF_INFO, &mut key).unwrap();
        let nonce = [3u8; 12];
        let plaintext = br#"{"username":"managed-user","password":"managed-password"}"#;
        let ciphertext = Aes256Gcm::new_from_slice(&key)
            .unwrap()
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: plaintext,
                    aad: b"session-id\nhttps://example.com",
                },
            )
            .unwrap();
        let session = WebCredentialSession {
            id: "session-id".to_string(),
            access_token: "once".to_string(),
            endpoint: Url::parse("http://127.0.0.1:5001/_jumpserver/web-sessions/").unwrap(),
            origin: "https://example.com".to_string(),
            username_selector: "id=username".to_string(),
            password_selector: "id=password".to_string(),
            submit_selector: "id=submit".to_string(),
            server_public_key: server_public.to_bytes(),
            private_key: client_key,
        };
        let credentials = session
            .decrypt(ReleasedCredentialResponse {
                nonce: BASE64.encode(nonce),
                ciphertext: BASE64.encode(ciphertext),
            })
            .unwrap();
        assert_eq!(credentials.username, "managed-user");
        assert_eq!(credentials.password, "managed-password");
        assert_eq!(
            Url::parse("http://127.0.0.1:5001")
                .unwrap()
                .join(CREDENTIAL_PATH)
                .unwrap()
                .join("session-id/credentials")
                .unwrap()
                .path(),
            "/_jumpserver/web-sessions/session-id/credentials"
        );
    }
}
