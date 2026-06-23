use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};
use std::time::Duration;

pub struct VersionService {
    api: ApiRequestClient,
}

impl VersionService {
    /// 创建版本服务，该服务访问公开接口，不需要 Token 和组织上下文
    pub fn new(origin: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            api: ApiRequestClient::with_origin(origin, String::new(), String::new())?,
        })
    }

    /// 获取客户端版本信息
    pub async fn get_version_message(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::settings::CLIENT_VERSIONS);
        log::info!("获取当前版本信息: {}", url);
        // 该接口为公开接口，不需要 bearer_token
        self.api
            .get_with_response_timeout(&url, Duration::from_secs(10))
            .await
    }
}
