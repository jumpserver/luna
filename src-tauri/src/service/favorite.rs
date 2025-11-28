use crate::commands::requests::{delete_with_response, post_with_response, ApiResponse};
use serde::Serialize;
use serde_json::to_value;

pub struct FavoriteService {
    origin: String,
    asset_id: String,
    bearer_token: String,
}

#[derive(Serialize)]
pub struct FavoriteAssetBody {
    asset: String,
}

impl FavoriteService {
    pub fn new(origin: String, bearer_token: String, asset_id: String) -> Self {
        Self {
            origin,
            bearer_token,
            asset_id,
        }
    }

    pub async fn favorite(&self) -> ApiResponse {
        let url = format!("{}/api/v1/assets/favorite-assets/", self.origin);
        let body_value = to_value(&FavoriteAssetBody {
            asset: self.asset_id.clone(),
        })
        .unwrap_or_default();

        post_with_response(&url, &self.bearer_token, &body_value).await
    }

    pub async fn unfavorite(&self) -> ApiResponse {
        let url = format!(
            "{}/api/v1/assets/favorite-assets/?asset={}",
            self.origin, self.asset_id
        );

        delete_with_response(&url, &self.bearer_token, ()).await
    }
}
