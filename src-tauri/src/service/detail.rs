use crate::commands::requests::{get_with_response, ApiResponse};

pub struct DetailService {
    origin: String,
    cookie_header: String,
    asset_id: String,
}

impl DetailService {
    pub fn new(origin: String, cookie_header: String, asset_id: String) -> Self {
        Self {
            origin,
            cookie_header,
            asset_id,
        }
    }

    pub async fn get_asset_detail(&self) -> ApiResponse {
        let url = format!(
            "{}/api/v1/perms/users/self/assets/{}",
            self.origin, self.asset_id
        );
        get_with_response(&url, &self.cookie_header).await
    }
}
