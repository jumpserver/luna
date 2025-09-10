use crate::commands::requests::{get_with_response_and_query, ApiResponse};
use log::info;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    #[default]
    Linux,
    Windows,
    Database,
    Device,
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

    pub org: String,
}

impl AssetQuery {
    pub fn new(asset_type: Category, org: String) -> Self {
        match asset_type {
            Category::Database | Category::Device => Self {
                r#type: None,
                category: Some(asset_type),
                offset: None,
                limit: None,
                search: None,
                order: None,
                org,
            },
            Category::Linux | Category::Windows => Self {
                r#type: Some(asset_type),
                category: None,
                offset: None,
                limit: None,
                search: None,
                order: None,
                org,
            },
        }
    }

    pub fn get_category(&self) -> Category {
        self.category.or(self.r#type).unwrap_or_default()
    }
}

pub trait HasOrg {
    fn org(&self) -> &str;
}

impl HasOrg for AssetQuery {
    fn org(&self) -> &str {
        &self.org
    }
}

pub struct AssetService {
    origin: String,
    cookie_header: String,
    query: AssetQuery,
}

impl AssetService {
    pub fn new(origin: String, cookie_header: String, query: AssetQuery) -> Self {
        Self {
            origin,
            cookie_header,
            query,
        }
    }

    pub async fn get_category_assets(&self) -> ApiResponse {
        let url = format!("{}/api/v1/perms/users/self/assets/", self.origin);
        let category = self.query.get_category();

        info!("获取类型为：{:?} 的资产信息，请求 url: {}", category, url);

        let query = match category {
            Category::Database | Category::Device => AssetQuery {
                r#type: None,
                category: Some(category),
                offset: Some(self.query.offset.unwrap_or(0)),
                limit: Some(self.query.limit.unwrap_or(20)),
                search: Some(self.query.search.clone().unwrap_or_default()),
                order: Some(self.query.order.clone().unwrap_or_default()),
                org: self.query.org.clone(),
            },
            Category::Linux | Category::Windows => AssetQuery {
                r#type: Some(category),
                category: None,
                offset: Some(self.query.offset.unwrap_or(0)),
                limit: Some(self.query.limit.unwrap_or(20)),
                search: Some(self.query.search.clone().unwrap_or_default()),
                order: Some(self.query.order.clone().unwrap_or_default()),
                org: self.query.org.clone(),
            },
        };

        get_with_response_and_query(&url, &self.cookie_header, &query).await
    }

    pub async fn get_asset_details(&self, asset_id: String) {
        let _url = format!(
            "{}/api/v1/perms/users/self/assets/{}",
            self.origin, &asset_id
        );
    }
}
