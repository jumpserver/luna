use crate::api::request::{ApiRequestClient, ApiResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use url::Url;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenRequestBody {
    pub asset: String,
    pub account: String,
    pub protocol: String,
    pub input_username: String,
    pub input_secret: String,
    pub connect_method: String,
    pub connect_options: Option<Value>,
}

pub struct TokenService {
    pub site: String,
    pub api: ApiRequestClient,
    pub request_body: TokenRequestBody,
}

impl TokenService {
    pub fn new(
        site: String,
        bearer_token: String,
        org_id: String,
        request_body: TokenRequestBody,
    ) -> Result<Self, reqwest::Error> {
        Ok(Self {
            site,
            api: ApiRequestClient::new(bearer_token, org_id)?,
            request_body,
        })
    }

    pub async fn get_connect_token(&self) -> ApiResponse {
        let url = format!("{}/api/v1/authentication/connection-token/", self.site);

        self.api
            .post_json_with_response(&url, &self.request_body)
            .await
    }

    pub async fn get_local_client_url(
        &self,
        token_id: String,
        extra_params: Option<&HashMap<String, String>>,
    ) -> ApiResponse {
        let mut url = format!(
            "{}/api/v1/authentication/connection-token/{}/client-url/",
            self.site, &token_id
        );
        if let Some(params) = extra_params {
            if let Ok(mut parsed) = Url::parse(&url) {
                {
                    let mut query = parsed.query_pairs_mut();
                    for (key, value) in params {
                        query.append_pair(key, value);
                    }
                }
                url = parsed.to_string();
            }
        }
        self.api.get_with_response(&url).await
    }
}
