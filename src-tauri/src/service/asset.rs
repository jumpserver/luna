use crate::api::endpoint;
use crate::api::request::{ApiRequestClient, ApiResponse};
use log::info;
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    #[default]
    Linux,
    Windows,
    #[serde(rename = "windows_ad")]
    WindowsAd,
    Database,
    Device,
    Web,
}

#[derive(Serialize, Deserialize, Default, Debug, Clone)]
pub struct AssetQuery {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub r#type: Option<Category>,

    #[serde(rename = "category", skip_serializing_if = "Option::is_none")]
    pub category: Option<Category>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<String>,

    #[serde(default)]
    pub oid: String,
}

impl AssetQuery {
    // 根据资产类型和组织初始化资产查询参数
    #[allow(dead_code)]
    pub fn new(asset_type: Category, org: String) -> Self {
        let (r#type, category) = match asset_type {
            Category::Database | Category::Device => (None, Some(asset_type)),
            Category::Linux | Category::Windows | Category::WindowsAd | Category::Web => {
                (Some(asset_type), None)
            }
        };

        Self {
            r#type,
            category,
            offset: None,
            limit: None,
            search: None,
            order: None,
            oid: org,
        }
    }

    /// 获取当前查询使用的资产分类
    /// TODO 不理解这里面的代码 or 是什么意思 r#type 是什么意思
    pub fn get_category(&self) -> Category {
        self.category.or(self.r#type).unwrap_or_default()
    }
}

#[derive(Serialize)]
struct RenameBody {
    asset: String,
    name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    oid: String,
}

#[derive(Serialize)]
struct FavoriteAssetBody {
    asset: String,
}

pub struct AssetService {
    api: ApiRequestClient,
}

impl AssetService {
    pub fn new(api: ApiRequestClient) -> Self {
        Self { api }
    }

    /// 获取指定分类下的资产列表，支持普通资产和收藏节点资产两种入口
    pub async fn get_category_assets(&self, query: &AssetQuery, favorite: bool) -> ApiResponse {
        let path = if favorite {
            endpoint::assets::FAVORITE_NODE_ASSETS
        } else {
            endpoint::assets::FAVORITE_ASSETS
        };

        let url = self.api.endpoint(path);

        info!(
            "获取类型为：{:?} 的资产信息，请求 url: {}, oid: {}",
            query.get_category(),
            url,
            query.oid
        );
        info!("query: {:?}", query);

        let (r#type, category) = if favorite {
            (None, None)
        } else {
            match query.get_category() {
                Category::Linux => (Some(Category::Linux), None),
                Category::Windows => (Some(Category::Windows), None),
                Category::WindowsAd => (Some(Category::WindowsAd), None),
                Category::Database => (None, Some(Category::Database)),
                Category::Device => (None, Some(Category::Device)),
                Category::Web => (None, Some(Category::Web)),
            }
        };

        let query = AssetQuery {
            r#type,
            category,
            offset: Some(query.offset.unwrap_or(0)),
            limit: Some(query.limit.unwrap_or(20)),
            search: Some(query.search.clone().unwrap_or_default()),
            order: Some(query.order.clone().unwrap_or_default()),
            oid: query.oid.clone(),
        };

        self.api.get_with_query_response(&url, &query).await
    }

    /// 获取当前用户收藏的资产列表
    pub async fn get_favorite_assets(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::assets::FAVORITE_ASSETS);
        self.api.get_with_response(&url).await
    }

    /// 获取指定资产的详情信息
    pub async fn get_asset_detail(&self, asset_id: &str) -> ApiResponse {
        let path = endpoint::assets::detail(asset_id);
        let url = self.api.endpoint(&path);

        self.api.get_with_response(&url).await
    }

    /// 将指定资产加入收藏
    pub async fn favorite(&self, asset_id: &str) -> ApiResponse {
        let url = self.api.endpoint(endpoint::assets::FAVORITE_ASSETS);
        let body = FavoriteAssetBody {
            asset: asset_id.to_string(),
        };

        self.api.post_json_with_response(&url, &body).await
    }

    /// 从收藏列表中移除指定资产
    pub async fn unfavorite(&self, asset_id: &str) -> ApiResponse {
        let mut url = self.api.endpoint(endpoint::assets::FAVORITE_ASSETS);

        // TODO 为什么要怎么做呢
        if let Ok(mut parsed) = Url::parse(&url) {
            parsed.query_pairs_mut().append_pair("asset", asset_id);
            url = parsed.to_string();
        };

        self.api.delete_with_response(&url).await
    }

    /// 提交资产重命名请求
    pub async fn rename(&self, asset_id: &str, name: &str, oid: &str) -> ApiResponse {
        let url = self.api.endpoint(endpoint::assets::MY_ASSET);
        let body = RenameBody {
            asset: asset_id.to_string(),
            name: name.to_string(),
            oid: oid.to_string(),
        };

        self.api.post_json_with_response(&url, &body).await
    }
}



























