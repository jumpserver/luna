use log::info;
use serde::{Deserialize, Serialize};
use crate::commands::requests::{get_with_response_and_query, ApiResponse};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    #[default]
    Linux,
    Windows,
    Database,
}

#[derive(Serialize, Deserialize, Default, Debug, Clone)]
pub struct AssetQuery {
    #[serde(rename = "type")]
    pub r#type: Category,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<String>,
}

pub struct AssetService {
    origin: String,
    cookie_header: String,
    query: AssetQuery,
}

impl AssetService {
    pub fn new(origin: String, cookie_header: String, query: AssetQuery) -> Self {
        Self { origin, cookie_header, query }
    }

    pub async fn get_category_assets(
        &self,
    ) -> ApiResponse {
        let url = format!("{}/api/v1/perms/users/self/assets/", self.origin);
        info!("获取类型为：{:?} 的资产信息，请求 url: {}", self.query.r#type, url);

        let query = AssetQuery {
            r#type: self.query.r#type,
            offset: Some(self.query.offset.unwrap_or(0)),
            limit: Some(self.query.limit.unwrap_or(20)),
            search: Some(self.query.search.clone().unwrap_or_default()),
            order: Some(self.query.order.clone().unwrap_or_default()),
        };

        get_with_response_and_query(&url, &self.cookie_header, &query).await
    }

    pub async fn get_asset_details(&self, asset_id: String) {
        let _url = format!("{}/api/v1/perms/users/self/assets/{}", self.origin, &asset_id);
    }
}