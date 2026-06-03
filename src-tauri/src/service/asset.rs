use crate::api::request::{ApiRequestClient, ApiResponse};
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

    pub oid: String,
}

impl AssetQuery {
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

    pub fn get_category(&self) -> Category {
        self.category.or(self.r#type).unwrap_or_default()
    }
}

pub struct AssetService {
    origin: String,
    api: ApiRequestClient,
    query: AssetQuery,
}

impl AssetService {
    pub fn new(
        origin: String,
        bearer_token: String,
        query: AssetQuery,
    ) -> Result<Self, reqwest::Error> {
        let org_id = query.oid.clone();

        Ok(Self {
            origin,
            api: ApiRequestClient::new(bearer_token, org_id)?,
            query,
        })
    }

    pub async fn get_category_assets(&self, favorite: bool) -> ApiResponse {
        let url = if favorite {
            format!(
                "{}/api/v1/perms/users/self/nodes/favorite/assets/",
                self.origin
            )
        } else {
            format!("{}/api/v1/perms/users/self/assets/", self.origin)
        };

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

    pub async fn get_favorite_assets(&self) -> ApiResponse {
        let url = format!("{}/api/v1/assets/favorite-assets/", &self.origin);

        self.api.get_with_response(&url).await
    }
}
