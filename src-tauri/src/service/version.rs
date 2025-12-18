use crate::commands::requests::{get_with_response, ApiResponse};

#[derive(Clone)]
pub struct VersionService {
    origin: String,
}

impl VersionService {
    pub fn new(origin: String) -> Self {
        Self { origin }
    }

    pub async fn get_version_message(&self) -> ApiResponse {
        let url = format!("{}/api/v1/settings/client/versions/", self.origin);
        log::info!("获取当前版本信息: {}", url);
        // 该接口为公开接口，不需要 bearer_token
        get_with_response(&url, "").await
    }
}

