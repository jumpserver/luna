use chrono::{Local, Offset};
use log::info;
use reqwest::header::COOKIE;

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
