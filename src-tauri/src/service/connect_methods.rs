use crate::api::request::{ApiRequestClient, ApiResponse};

pub struct ConnectMethodsService {
    origin: String,
    api: ApiRequestClient,
}

impl ConnectMethodsService {
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

    pub async fn get_connect_methods(&self) -> ApiResponse {
        let url = format!(
            "{}/api/v1/terminal/components/connect-methods/",
            self.origin
        );
        self.api.get_with_response(&url).await
    }
}
