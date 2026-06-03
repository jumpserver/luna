use crate::api::request::{ApiRequestClient, ApiResponse};
use serde::Serialize;

pub struct FavoriteService {
    origin: String,
    asset_id: String,
    api: ApiRequestClient,
}

#[derive(Serialize)]
pub struct FavoriteAssetBody {
    asset: String,
}

impl FavoriteService {
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

    pub async fn favorite(&self) -> ApiResponse {
        let url = format!("{}/api/v1/assets/favorite-assets/", self.origin);
        let body = FavoriteAssetBody {
            asset: self.asset_id.clone(),
        };

        self.api.post_json_with_response(&url, &body).await
    }

    pub async fn unfavorite(&self) -> ApiResponse {
        let url = format!(
            "{}/api/v1/assets/favorite-assets/?asset={}",
            self.origin, self.asset_id
        );

        self.api.delete_with_response(&url).await
    }
}
