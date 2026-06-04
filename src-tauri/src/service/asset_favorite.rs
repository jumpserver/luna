use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};
use serde::Serialize;
use url::Url;

pub struct FavoriteService {
    asset_id: String,
    api: ApiRequestClient,
}

#[derive(Serialize)]
pub struct FavoriteAssetBody {
    asset: String,
}

impl FavoriteService {
    /// 创建资产收藏服务，复用 command 层从当前会话构建好的 API 客户端
    pub fn new(api: ApiRequestClient, asset_id: String) -> Self {
        Self { api, asset_id }
    }

    /// 将指定资产加入收藏
    pub async fn favorite(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::assets::FAVORITE_ASSETS);
        let body = FavoriteAssetBody {
            asset: self.asset_id.clone(),
        };

        self.api.post_json_with_response(&url, &body).await
    }

    /// 从收藏列表中移除指定资产
    pub async fn unfavorite(&self) -> ApiResponse {
        let mut url = self.api.endpoint(endpoint::assets::FAVORITE_ASSETS);
        if let Ok(mut parsed) = Url::parse(&url) {
            parsed
                .query_pairs_mut()
                .append_pair("asset", &self.asset_id);
            url = parsed.to_string();
        }

        self.api.delete_with_response(&url).await
    }
}
