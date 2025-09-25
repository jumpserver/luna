use crate::commands::requests::{post_with_response, ApiResponse};
use serde::{Deserialize, Serialize};
use serde_json::to_value;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenRequestBody {
    pub asset: String,
    pub account: String,
    pub protocol: String,
    pub input_username: String,
    pub input_secret: String,
    pub connect_method: String,
}

pub struct TokenService {
    pub site: String,
    pub cookie_header: String,
    pub request_body: TokenRequestBody,
}

impl TokenService {
    pub fn new(site: String, cookie_header: String, request_body: TokenRequestBody) -> Self {
        Self {
            site,
            cookie_header,
            request_body,
        }
    }

    pub async fn get_connect_token(&self) -> ApiResponse {
        let url = format!("{}/api/v1/authentication/connection-token/", self.site);
        let body_value = to_value(&self.request_body).unwrap_or_default();
        post_with_response(&url, &self.cookie_header, &body_value).await
    }
}
