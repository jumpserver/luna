use crate::service::asset::HasOrg;
use chrono::{Local, Offset};
use log::info;
use reqwest::header::COOKIE;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub data: String,
    pub success: bool,
}
pub async fn get(url: &str, header_cookie: &str) -> Result<reqwest::Response, reqwest::Error> {
    info!("GET {}", url);

    // 提取 csrf token
    let csrf_token = header_cookie
        .split(';')
        .find_map(|kv| {
            let kv = kv.trim();
            if kv.contains("csrftoken") {
                kv.split_once('=').map(|(_, v)| v.to_string())
            } else {
                None
            }
        })
        .unwrap_or_default();

    let local_offset = Local::now().offset().fix().local_minus_utc();
    let hours = local_offset / 3600;
    let minutes = (local_offset % 3600) / 60;
    let tz_string = format!("{:+03}:{:02}", hours, minutes);

    let client = reqwest::Client::new();
    let request = client
        .get(url)
        .header(COOKIE, header_cookie)
        .header("X-TZ", &tz_string)
        .header("X-Csrftoken", &csrf_token)
        .build()?;

    client.execute(request).await
}

// TODO 合并到一个里面
pub async fn get_with_query<Q>(
    url: &str,
    header_cookie: &str,
    query: &Q,
) -> Result<reqwest::Response, reqwest::Error>
where
    Q: Serialize + HasOrg + ?Sized,
{
    info!("GET {} (with query)", url);

    let csrf_token = header_cookie
        .split(';')
        .find_map(|kv| {
            let kv = kv.trim();
            if kv.contains("csrftoken") {
                kv.split_once('=').map(|(_, v)| v.to_string())
            } else {
                None
            }
        })
        .unwrap_or_default();

    let local_offset = Local::now().offset().fix().local_minus_utc();
    let hours = local_offset / 3600;
    let minutes = (local_offset % 3600) / 60;
    let tz_string = format!("{:+03}:{:02}", hours, minutes);

    let org = query.org();

    let client = reqwest::Client::new();
    let request = client
        .get(url)
        .query(query)
        .header(COOKIE, header_cookie)
        .header("X-TZ", &tz_string)
        .header("X-Csrftoken", &csrf_token)
        .header("X-JMS-ORG", org)
        .build()?;

    client.execute(request).await
}

pub async fn get_with_response(url: &str, header_cookie: &str) -> ApiResponse {
    match get(url, header_cookie).await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let data = resp.text().await.unwrap_or_default();
            let success = status == 200;

            ApiResponse {
                status,
                data,
                success,
            }
        }
        Err(e) => {
            log::warn!("请求 {} 失败: {}", url, e);
            ApiResponse {
                status: 0,
                data: format!("请求失败: {}", e),
                success: false,
            }
        }
    }
}

pub async fn get_with_response_and_query<Q>(
    url: &str,
    header_cookie: &str,
    query: &Q,
) -> ApiResponse
where
    Q: Serialize + HasOrg + ?Sized,
{
    match get_with_query(url, header_cookie, query).await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let data = resp.text().await.unwrap_or_default();
            ApiResponse {
                status,
                data,
                success: status == 200,
            }
        }
        Err(e) => {
            log::warn!("请求 {} 失败: {}", url, e);
            ApiResponse {
                status: 0,
                data: format!("请求失败: {}", e),
                success: false,
            }
        }
    }
}
