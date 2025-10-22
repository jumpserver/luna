use crate::service::asset::HasOrg;
use crate::utils::{extract_csrf_token, to_api_response, tz_offset_string};

use log::info;
use reqwest::header::COOKIE;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub data: String,
    pub success: bool,
}

pub trait MaybeQuery {
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder;
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

pub trait MaybeJson {
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder;
    fn debug_body(&self) -> Option<String> {
        None
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
    header_cookie: &str,
) -> reqwest::RequestBuilder {
    let csrf_token = extract_csrf_token(header_cookie);
    let tz_string = tz_offset_string();

    client
        .get(url)
        .header(COOKIE, header_cookie)
        .header("X-TZ", tz_string)
        .header("X-Csrftoken", csrf_token)
}

// 构造带通用头的 POST 请求
fn base_post_request(
    client: &reqwest::Client,
    url: &str,
    header_cookie: &str,
) -> reqwest::RequestBuilder {
    let csrf_token = extract_csrf_token(header_cookie);
    let tz_string = tz_offset_string();

    client
        .post(url)
        .header(COOKIE, header_cookie)
        .header("X-TZ", tz_string)
        .header("X-Csrftoken", csrf_token)
}

// 构造带通用头的 DELETE 请求
fn base_delete_request(
    client: &reqwest::Client,
    url: &str,
    header_cookie: &str,
) -> reqwest::RequestBuilder {
    let csrf_token = extract_csrf_token(header_cookie);
    let tz_string = tz_offset_string();

    client
        .delete(url)
        .header(COOKIE, header_cookie)
        .header("X-TZ", tz_string)
        .header("X-Csrftoken", csrf_token)
}

pub async fn get_unified<M>(
    url: &str,
    header_cookie: &str,
    maybe_query: M,
) -> Result<reqwest::Response, reqwest::Error>
where
    M: MaybeQuery,
{
    info!("GET {}", url);

    let client = insecure_client()?;
    let request = maybe_query
        .apply(base_get_request(&client, url, header_cookie))
        .build()?;
    client.execute(request).await
}

pub async fn post_unified<M>(
    url: &str,
    header_cookie: &str,
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
        .apply(base_post_request(&client, url, header_cookie))
        .build()?;
    client.execute(request).await
}

pub async fn delete_unified<M>(
    url: &str,
    header_cookie: &str,
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
        .apply(base_delete_request(&client, url, header_cookie))
        .build()?;
    client.execute(request).await
}

pub async fn get(url: &str, header_cookie: &str) -> Result<reqwest::Response, reqwest::Error> {
    get_unified(url, header_cookie, ()).await
}

pub async fn get_with_response(url: &str, header_cookie: &str) -> ApiResponse {
    to_api_response(url, get(url, header_cookie).await).await
}

pub async fn post_with_response<M>(url: &str, header_cookie: &str, body: M) -> ApiResponse
where
    M: MaybeJson,
{
    to_api_response(url, post_unified(url, header_cookie, body).await).await
}

pub async fn delete_with_response<M>(url: &str, header_cookie: &str, body: M) -> ApiResponse
where
    M: MaybeJson,
{
    to_api_response(url, delete_unified(url, header_cookie, body).await).await
}

fn insecure_client() -> Result<reqwest::Client, reqwest::Error> {
    let mut builder = reqwest::Client::builder();

    // 忽略无效证书（自签名、过期等）
    builder = builder.danger_accept_invalid_certs(true);
    builder.build()
}
