use crate::service::asset::HasOrg;
use crate::utils::{extract_csrf_token, to_api_response, tz_offset_string};

use log::info;
use reqwest::header::COOKIE;
use serde::ser::Serializer;
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
}

impl<Q> MaybeJson for &Q
where
    Q: Serialize + HasOrg + ?Sized,
{
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb.json(self).header("X-JMS-ORG", self.org())
    }
}

impl MaybeJson for &serde_json::Value {
    fn apply(self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb.json(self)
    }
}

// 一个通用包装器：不改变 JSON 序列化（仅序列化内部 body），
// 但实现 HasOrg 以便沿用 GET 同款自动添加 X-JMS-ORG 的逻辑。
pub struct WithOrg<'a, T: Serialize + ?Sized> {
    pub body: &'a T,
    pub org: &'a str,
}

impl<'a, T: Serialize + ?Sized> Serialize for WithOrg<'a, T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.body.serialize(serializer)
    }
}

impl<'a, T: Serialize + ?Sized> HasOrg for WithOrg<'a, T> {
    fn org(&self) -> &str {
        self.org
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

pub async fn get_unified<M>(
    url: &str,
    header_cookie: &str,
    maybe_query: M,
) -> Result<reqwest::Response, reqwest::Error>
where
    M: MaybeQuery,
{
    info!("GET {}", url);

    let client = reqwest::Client::new();
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

    let client = reqwest::Client::new();
    let request = maybe_json
        .apply(base_post_request(&client, url, header_cookie))
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
