use crate::api::request::{ApiRequestClient, ApiResponse};
use serde::Serialize;

#[derive(Serialize)]
pub struct RenameBody {
    asset: String,
    name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    oid: String,
}

pub struct RenameService {
    origin: String,
    asset_id: String,
    name: String,
    api: ApiRequestClient,
    oid: String,
}

impl RenameService {
    pub fn new(
        origin: String,
        bearer_token: String,
        asset_id: String,
        name: String,
        oid: String,
    ) -> Result<Self, reqwest::Error> {
        Ok(Self {
            origin,
            api: ApiRequestClient::new(bearer_token, oid.clone())?,
            asset_id,
            name,
            oid,
        })
    }

    pub async fn rename(&self) -> ApiResponse {
        let url = format!("{}/api/v1/assets/my-asset/", self.origin);

        let body = RenameBody {
            asset: self.asset_id.clone(),
            name: self.name.clone(),
            oid: self.oid.clone(),
        };

        self.api.post_json_with_response(&url, &body).await
    }
}
