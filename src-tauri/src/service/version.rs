use crate::api::request::{ApiRequestClient, ApiResponse};

pub struct VersionService {
    origin: String,
    api: ApiRequestClient,
}

impl VersionService {
    pub fn new(origin: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            origin,
            api: ApiRequestClient::new(String::new(), String::new())?,
        })
    }

    pub async fn get_version_message(&self) -> ApiResponse {
        let url = format!("{}/api/v1/settings/client/versions/", self.origin);
        log::info!("获取当前版本信息: {}", url);
        // 该接口为公开接口，不需要 bearer_token
        self.api.get_with_response(&url).await
    }
}
