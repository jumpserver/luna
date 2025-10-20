use crate::commands::requests::{post_with_response, ApiResponse};
use crate::service::asset::HasOrg;
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
    cookie_header: String,
    oid: String,
}

impl RenameService {
    pub fn new(
        origin: String,
        cookie_header: String,
        asset_id: String,
        name: String,
        oid: String,
    ) -> Self {
        Self {
            origin,
            cookie_header,
            asset_id,
            name,
            oid,
        }
    }

    pub async fn rename(&self) -> ApiResponse {
        let url = format!("{}/api/v1/assets/my-asset/", self.origin);

        let body = RenameBody {
            asset: self.asset_id.clone(),
            name: self.name.clone(),
            oid: self.oid.clone(),
        };

        post_with_response(&url, &self.cookie_header, &body).await
    }
}

impl HasOrg for RenameBody {
    fn org(&self) -> &str {
        &self.oid
    }
}
