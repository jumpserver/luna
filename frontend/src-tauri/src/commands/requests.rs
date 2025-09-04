use log::info;
use reqwest::header::COOKIE;
use chrono::{Local, Offset};

pub async fn get(url: &str, header_cookie: &str) -> Result<String, reqwest::Error> {
    info!("GET {}", url);

    let csrf_token = header_cookie.split(";").find_map(|kv| {
        let kv = kv.trim();

        if kv.starts_with("jms_csrftoken=") {
            Some(kv.split_once('=').unwrap().1.to_string())
        }  else {
            None
        }
    }).unwrap_or_default();

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

    // 输出完整的请求信息
    info!("Headers: {:#?}", request.headers());

    let resp = client
        .execute(request)
        .await?
        .text()
        .await?;

    Ok(resp)
}
