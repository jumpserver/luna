use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};
use log::info;
use serde::{Deserialize, Serialize};

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
    /// 根据资产类型和组织初始化资产查询参数
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
    pub fn get_category(&self) -> Category {
        self.category.or(self.r#type).unwrap_or_default()
    }
}

pub struct AssetService {
    api: ApiRequestClient,
    query: AssetQuery,
}

impl AssetService {
    /// 创建资产服务，复用 command 层从当前会话构建好的 API 客户端
    pub fn new(api: ApiRequestClient, query: AssetQuery) -> Self {
        Self { api, query }
    }

    /// 获取指定分类下的资产列表，支持普通资产和收藏节点资产两种入口
    pub async fn get_category_assets(&self, favorite: bool) -> ApiResponse {
        let path = if favorite {
            endpoint::assets::FAVORITE_NODE_ASSETS
        } else {
            endpoint::assets::USER_ASSETS
        };
        let url = self.api.endpoint(path);

        info!(
            "获取类型为：{:?} 的资产信息，请求 url: {}, oid: {}",
            self.query.get_category(),
            url,
            self.query.oid
        );
        info!("query: {:?}", self.query);

        let (r#type, category) = if favorite {
            (None, None)
        } else {
            match self.query.get_category() {
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
            offset: Some(self.query.offset.unwrap_or(0)),
            limit: Some(self.query.limit.unwrap_or(20)),
            search: Some(self.query.search.clone().unwrap_or_default()),
            order: Some(self.query.order.clone().unwrap_or_default()),
            oid: self.query.oid.clone(),
        };

        self.api.get_with_query_response(&url, &query).await
    }

    /// 获取当前用户收藏的资产列表
    pub async fn get_favorite_assets(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::assets::FAVORITE_ASSETS);

        self.api.get_with_response(&url).await
    }
}
