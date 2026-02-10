use crate::commands::requests::{get_with_response, ApiResponse};

pub struct ConnectMethodsService {
    origin: String,
    bearer_token: String,
}

impl ConnectMethodsService {
    pub fn new(origin: String, bearer_token: String) -> Self {
        Self {
            origin,
            bearer_token,
        }
    }

    pub async fn get_connect_methods(&self) -> ApiResponse {
        let url = format!("{}/api/v1/terminal/components/connect-methods/", self.origin);
        get_with_response(&url, &self.bearer_token).await
    }
}