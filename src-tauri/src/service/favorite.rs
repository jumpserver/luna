use crate::commands::requests::{post_with_response, ApiResponse};
use serde::Serialize;
use serde_json::to_value;

#[derive(Serialize)]
pub struct FavoriteAssetBody {
    asset: String,
}

pub struct FavoriteService {
    origin: String,
    asset_id: String,
    cookie_header: String,
}

impl FavoriteService {
    pub fn new(origin: String, cookie_header: String, asset_id: String) -> Self {
        Self {
            origin,
            cookie_header,
            asset_id,
        }
    }

    pub async fn favorite(&self) -> ApiResponse {
        let url = format!("{}/api/v1/assets/favorite-assets/", self.origin);
        let body_value = to_value(&FavoriteAssetBody {
            asset: self.asset_id.clone(),
        })
        .unwrap_or_default();

        post_with_response(&url, &self.cookie_header, &body_value).await
    }
}
