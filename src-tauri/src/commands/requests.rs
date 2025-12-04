use crate::service::asset::HasOrg;
use crate::utils::{to_api_response, tz_offset_string};

use log::info;
use reqwest::header::AUTHORIZATION;
use serde::Serialize;
use url::Url;

/// 处理带有 query 参数的 trait
pub trait MaybeQuery {
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder;
}

/// 处理带有 json 参数的 trait
pub trait MaybeJson {
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder;
    fn debug_body(&self) -> Option<String> {
        None
    }
}


#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub data: String,
    pub success: bool,
}

impl MaybeQuery for () {
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb
    }
}

impl<Q> MaybeQuery for &Q
where
    Q: Serialize + HasOrg + ?Sized,
{
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb.query(self).header("X-JMS-ORG", self.org())
    }
}


impl MaybeJson for () {
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb
    }
}

impl<Q> MaybeJson for &Q
where
    Q: Serialize + HasOrg + ?Sized,
{
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb.json(self).header("X-JMS-ORG", self.org())
    }

    fn debug_body(&self) -> Option<String> {
        serde_json::to_string(*self).ok()
    }
}

impl MaybeJson for &serde_json::Value {
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb.json(self)
    }

    fn debug_body(&self) -> Option<String> {
        Some(self.to_string())
    }
}

// 构造带通用头的 GET 请求
fn base_get_request(
    client: &reqwest::Client,
    url: &str,
    bearer_token: &str,
) -> reqwest::RequestBuilder {
    let tz_string = tz_offset_string();
    let referer = referer_from(url);

    let mut rb = client.get(url).header("X-TZ", tz_string);

    if !bearer_token.is_empty() {
        rb = rb.header(AUTHORIZATION, format!("Bearer {}", bearer_token));
    }

    if let Some(r) = referer {
        rb = rb.header("Referer", r);
    }

    rb
}

// 构造带通用头的 POST 请求
fn base_post_request(
    client: &reqwest::Client,
    url: &str,
    bearer_token: &str,
) -> reqwest::RequestBuilder {
    let tz_string = tz_offset_string();
    let referer = referer_from(url);

    let mut rb = client.post(url).header("X-TZ", tz_string);

    if !bearer_token.is_empty() {
        rb = rb.header(AUTHORIZATION, format!("Bearer {}", bearer_token));
    }

    if let Some(r) = referer {
        rb = rb.header("Referer", r);
    }

    rb
}

// 构造带通用头的 DELETE 请求
fn base_delete_request(
    client: &reqwest::Client,
    url: &str,
    bearer_token: &str,
) -> reqwest::RequestBuilder {
    let tz_string = tz_offset_string();
    let referer = referer_from(url);

    let mut rb = client.delete(url).header("X-TZ", tz_string);

    if !bearer_token.is_empty() {
        rb = rb.header(AUTHORIZATION, format!("Bearer {}", bearer_token));
    }

    if let Some(r) = referer {
        rb = rb.header("Referer", r);
    }

    rb
}

pub async fn get_unified<M>(
    url: &str,
    bearer_token: &str,
    maybe_query: M,
) -> Result<reqwest::Response, reqwest::Error>
where
    M: MaybeQuery,
{
    info!("GET {}", url);

    let client = insecure_client()?;
    let request = maybe_query
        .apply(base_get_request(&client, url, bearer_token))
        .build()?;
    client.execute(request).await
}

pub async fn post_unified<M>(
    url: &str,
    bearer_token: &str,
    maybe_json: M,
) -> Result<reqwest::Response, reqwest::Error>
where
    M: MaybeJson,
{
    info!("POST {}", url);

    if let Some(body) = maybe_json.debug_body() {
        info!("body: {}", body);
    }

    let client = insecure_client()?;
    let request = maybe_json
        .apply(base_post_request(&client, url, bearer_token))
        .build()?;
    client.execute(request).await
}

pub async fn delete_unified<M>(
    url: &str,
    bearer_token: &str,
    maybe_json: M,
) -> Result<reqwest::Response, reqwest::Error>
where
    M: MaybeJson,
{
    info!("DELETE {}", url);

    if let Some(body) = maybe_json.debug_body() {
        info!("body: {}", body);
    }

    let client = insecure_client()?;
    let request = maybe_json
        .apply(base_delete_request(&client, url, bearer_token))
        .build()?;
    client.execute(request).await
}

pub async fn get(url: &str, bearer_token: &str) -> Result<reqwest::Response, reqwest::Error> {
    get_unified(url, bearer_token, ()).await
}

pub async fn get_with_response(url: &str, bearer_token: &str) -> ApiResponse {
    to_api_response(url, get(url, bearer_token).await).await
}

pub async fn post_with_response<M>(url: &str, bearer_token: &str, body: M) -> ApiResponse
where
    M: MaybeJson,
{
    to_api_response(url, post_unified(url, bearer_token, body).await).await
}

pub async fn delete_with_response<M>(url: &str, bearer_token: &str, body: M) -> ApiResponse
where
    M: MaybeJson,
{
    to_api_response(url, delete_unified(url, bearer_token, body).await).await
}

fn insecure_client() -> Result<reqwest::Client, reqwest::Error> {
    let mut builder = reqwest::Client::builder();

    // 忽略无效证书（自签名、过期等）
    builder = builder.danger_accept_invalid_certs(true);
    builder.build()
}

fn referer_from(url: &str) -> Option<String> {
    Url::parse(url).ok().and_then(|u| match u.scheme() {
        "http" | "https" => {
            let host = u.host_str()?;
            let mut origin = format!("{}://{}", u.scheme(), host);

            if let Some(port) = u.port() {
                origin.push(':');
                origin.push_str(&port.to_string());
            }

            Some(origin)
        }
        _ => None,
    })
}
