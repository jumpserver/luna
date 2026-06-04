use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};
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
    pub api: ApiRequestClient,
    pub request_body: TokenRequestBody,
}

impl TokenService {
    /// 创建连接 Token 服务，复用 command 层从当前会话构建好的 API 客户端
    pub fn new(api: ApiRequestClient, request_body: TokenRequestBody) -> Self {
        Self { api, request_body }
    }

    /// 创建资产连接 Token
    pub async fn get_connect_token(&self) -> ApiResponse {
        let url = self
            .api
            .endpoint(endpoint::authentication::CONNECTION_TOKEN);

        self.api
            .post_json_with_response(&url, &self.request_body)
            .await
    }

    /// 根据连接 Token 获取本地客户端启动 URL
    pub async fn get_local_client_url(
        &self,
        token_id: String,
        extra_params: Option<&HashMap<String, String>>,
    ) -> ApiResponse {
        let path = endpoint::authentication::client_url(&token_id);
        let mut url = self.api.endpoint(&path);
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
