use crate::commands::requests::{get_with_response, ApiResponse};

pub struct SettingService {
    origin: String,
    bearer_token: String,
}

impl SettingService {
    pub fn new(origin: String, bearer_token: String) -> Self {
        Self {
            origin,
            bearer_token,
        }
    }

    pub async fn get_setting(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/preference/?category=luna", self.origin);
        get_with_response(&url, &self.bearer_token).await
    }
}
