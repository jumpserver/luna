use crate::commands::requests::{get_with_response, ApiResponse};

pub struct SettingService {
    origin: String,
    cookie_header: String,
}

impl SettingService {
    pub fn new(origin: String, cookie_header: String) -> Self {
        Self {
            origin,
            cookie_header,
        }
    }

    pub async fn get_setting(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/preference/?category=luna", self.origin);
        get_with_response(&url, &self.cookie_header).await
    }
}
