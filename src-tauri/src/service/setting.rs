use crate::api::request::{ApiRequestClient, ApiResponse};

pub struct SettingService {
    origin: String,
    api: ApiRequestClient,
}

impl SettingService {
    pub fn new(
        origin: String,
        bearer_token: String,
        org_id: String,
    ) -> Result<Self, reqwest::Error> {
        Ok(Self {
            origin,
            api: ApiRequestClient::new(bearer_token, org_id)?,
        })
    }

    pub async fn get_setting(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/preference/?category=luna", self.origin);
        self.api.get_with_response(&url).await
    }
}
