use crate::api::endpoint;
use crate::api::request::{ApiRequestClient, ApiResponse};
use log::info;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cmp::Ordering;
use std::collections::HashSet;
use url::Url;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    #[default]
    Linux,
    Windows,
    #[serde(rename = "windows_ad")]
    WindowsAd,
    Unix,
    Other,
    Database,
    Device,
    Web,
}

#[derive(Debug, Deserialize)]
struct AssetListResponse {
    count: usize,
    next: Option<String>,
    previous: Option<String>,
    results: Vec<Value>,
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
        // r#type 这种形式是因为 type 是 Rust 关键字，所以要写成 r#type
        let (r#type, category) = match asset_type {
            Category::Database | Category::Device => (None, Some(asset_type)),
            Category::Web => (None, Some(asset_type)),
            Category::Linux
            | Category::Windows
            | Category::WindowsAd
            | Category::Unix
            | Category::Other => (Some(asset_type), None),
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
        // 先调用 category，如果没有就用 type
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
            endpoint::assets::USER_ASSETS
        };

        let url = self.api.endpoint(path);

        info!(
            "获取类型为：{:?} 的资产信息，请求 url: {}, oid: {}",
            query.get_category(),
            url,
            query.oid
        );
        info!("query: {:?}", query);

        if favorite {
            let favorite_query = AssetQuery {
                r#type: None,
                category: None,
                offset: Some(query.offset.unwrap_or(0)),
                limit: Some(query.limit.unwrap_or(20)),
                search: Some(query.search.clone().unwrap_or_default()),
                order: Some(query.order.clone().unwrap_or_default()),
                oid: query.oid.clone(),
            };

            return self
                .api
                .get_with_query_response(&url, &favorite_query)
                .await;
        }

        let queries = Self::expand_queries(query);

        if queries.len() == 1 {
            return self.api.get_with_query_response(&url, &queries[0]).await;
        }

        self.get_combined_category_assets(&url, query, &queries)
            .await
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

    fn expand_queries(query: &AssetQuery) -> Vec<AssetQuery> {
        let offset = Some(query.offset.unwrap_or(0));
        let limit = Some(query.limit.unwrap_or(20));
        let search = Some(query.search.clone().unwrap_or_default());
        let order = Some(query.order.clone().unwrap_or_default());
        let oid = query.oid.clone();

        let exact = |r#type: Option<Category>, category: Option<Category>| AssetQuery {
            r#type,
            category,
            offset,
            limit,
            search: search.clone(),
            order: order.clone(),
            oid: oid.clone(),
        };

        if query.r#type.is_none() && query.category.is_none() {
            return vec![
                exact(Some(Category::Linux), None),
                exact(Some(Category::Windows), None),
                exact(Some(Category::WindowsAd), None),
                exact(Some(Category::Unix), None),
                exact(Some(Category::Other), None),
                exact(None, Some(Category::Database)),
                exact(None, Some(Category::Device)),
                exact(None, Some(Category::Web)),
            ];
        }

        // 菜单和 JumpServer 的原始 type/category 不是一一对应：
        // Windows 要合并 windows + windows_ad，Other 要合并 unix + other。
        match query.get_category() {
            Category::Linux => vec![exact(Some(Category::Linux), None)],
            Category::Windows => vec![
                exact(Some(Category::Windows), None),
                exact(Some(Category::WindowsAd), None),
            ],
            Category::WindowsAd => vec![exact(Some(Category::WindowsAd), None)],
            Category::Unix => vec![exact(Some(Category::Unix), None)],
            Category::Other => vec![
                exact(Some(Category::Unix), None),
                exact(Some(Category::Other), None),
            ],
            Category::Database => vec![exact(None, Some(Category::Database))],
            Category::Device => vec![exact(None, Some(Category::Device))],
            Category::Web => vec![exact(None, Some(Category::Web))],
        }
    }

    async fn get_combined_category_assets(
        &self,
        url: &str,
        query: &AssetQuery,
        queries: &[AssetQuery],
    ) -> ApiResponse {
        let mut combined: Vec<Value> = Vec::new();
        let mut seen_ids = HashSet::new();

        for sub_query in queries {
            let response = self.fetch_all_assets(url, sub_query).await;
            let list = match response {
                Ok(list) => list,
                Err(err) => return err,
            };

            for item in list {
                let asset_id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();

                // 合并多个接口结果时按资产 ID 去重，避免未来后端类型收敛后重复展示。
                if asset_id.is_empty() || seen_ids.insert(asset_id) {
                    combined.push(item);
                }
            }
        }

        // 多个独立查询拼起来后需要重新做一次全量排序，否则列表会按子查询分段。
        Self::sort_assets(&mut combined, query.order.as_deref());

        let total = combined.len();
        let offset = query.offset.unwrap_or(0) as usize;
        let limit = query.limit.unwrap_or(20) as usize;
        let results = combined
            .into_iter()
            .skip(offset)
            .take(limit)
            .collect::<Vec<_>>();

        ApiResponse::ok(
            200,
            json!({
                "count": total,
                "next": Value::Null,
                "previous": Value::Null,
                "results": results,
            })
            .to_string(),
        )
    }

    async fn fetch_all_assets(
        &self,
        url: &str,
        query: &AssetQuery,
    ) -> Result<Vec<Value>, ApiResponse> {
        const BATCH_LIMIT: u32 = 200;

        let mut offset = 0;
        let mut all_results = Vec::new();

        loop {
            let page_query = AssetQuery {
                r#type: query.r#type,
                category: query.category,
                offset: Some(offset),
                limit: Some(BATCH_LIMIT),
                search: Some(query.search.clone().unwrap_or_default()),
                order: Some(query.order.clone().unwrap_or_default()),
                oid: query.oid.clone(),
            };

            let response = self.api.get_with_query_response(url, &page_query).await;
            if !response.success {
                return Err(response);
            }

            let payload: AssetListResponse = match serde_json::from_str(&response.data) {
                Ok(payload) => payload,
                Err(error) => {
                    return Err(ApiResponse::failed(format!(
                        "parse asset list response failed: {}",
                        error
                    )))
                }
            };

            let AssetListResponse {
                count,
                next: _next,
                previous: _previous,
                results,
            } = payload;

            let page_size = results.len();
            all_results.extend(results);

            // 这里主动翻完后端分页，前端菜单才能在“组合类型”场景下拿到准确总数和切片。
            if page_size == 0 || all_results.len() >= count {
                break;
            }

            offset += page_size as u32;
        }

        Ok(all_results)
    }

    fn sort_assets(results: &mut [Value], order: Option<&str>) {
        let normalized = order
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("name");

        // 当前客户端只有 name / date_updated 这几种排序，空值时退回 name 保证混合结果稳定。
        let descending = normalized.starts_with('-');
        let field = normalized.trim_start_matches('-');

        results.sort_by(|left, right| {
            let ordering = Self::compare_asset_field(left, right, field);
            if descending {
                ordering.reverse()
            } else {
                ordering
            }
        });
    }

    fn compare_asset_field(left: &Value, right: &Value, field: &str) -> Ordering {
        let left_value = Self::extract_asset_field(left, field);
        let right_value = Self::extract_asset_field(right, field);

        left_value.cmp(&right_value).then_with(|| {
            Self::extract_asset_field(left, "id").cmp(&Self::extract_asset_field(right, "id"))
        })
    }

    fn extract_asset_field(item: &Value, field: &str) -> String {
        item.get(field)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_lowercase()
    }
}
