use crate::api::request::{ApiRequestClient, ApiResponse};

pub struct DetailService {
    origin: String,
    api: ApiRequestClient,
    asset_id: String,
}

impl DetailService {
    pub fn new(
        origin: String,
        bearer_token: String,
        org_id: String,
        asset_id: String,
    ) -> Result<Self, reqwest::Error> {
        Ok(Self {
            origin,
            api: ApiRequestClient::new(bearer_token, org_id)?,
            asset_id,
        })
    }

    pub async fn get_asset_detail(&self) -> ApiResponse {
        let url = format!(
            "{}/api/v1/perms/users/self/assets/{}",
            self.origin, self.asset_id
        );
        self.api.get_with_response(&url).await
    }
}
