use crate::commands::requests::{get_with_response, ApiResponse};

pub struct DetailService {
    origin: String,
    bearer_token: String,
    asset_id: String,
}

impl DetailService {
    pub fn new(origin: String, bearer_token: String, asset_id: String) -> Self {
        Self {
            origin,
            bearer_token,
            asset_id,
        }
    }

    pub async fn get_asset_detail(&self) -> ApiResponse {
        let url = format!(
            "{}/api/v1/perms/users/self/assets/{}",
            self.origin, self.asset_id
        );
        get_with_response(&url, &self.bearer_token).await
    }
}
