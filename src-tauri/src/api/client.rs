use reqwest::{redirect, Client, ClientBuilder};
use std::net::IpAddr;
use url::Url;

/// 构建用于 JumpServer API 请求的默认 HTTP 客户端
///
/// 当前行为故意接受无效证书，因为现有代码支持自签名证书或其他非公开证书
pub(crate) fn api_client() -> Result<Client, reqwest::Error> {
    instance_client_builder().build()
}

/// 构建绑定指定站点 origin 的 HTTP 客户端。
///
/// 对于 localhost / 127.0.0.1 / ::1 这类本地回环地址，显式绕过系统代理，
/// 避免被本机代理软件拦截，导致本地开发站点请求失败。
pub(crate) fn api_client_for_origin(origin: &str) -> Result<Client, reqwest::Error> {
    instance_client_builder_for_origin(origin).build()
}

/// 构建一个用于 OAuth 请求的 HTTP 客户端，该客户端不允许重定向。
///
/// 目前，OAuth 代码交换需要禁用重定向处理，同时仍需保持与普通 API 请求相同的证书行为
pub(crate) fn oauth_client() -> Result<Client, reqwest::Error> {
    instance_client_builder()
        .redirect(redirect::Policy::none())
        .build()
}

/// 构建绑定指定站点 origin 的 OAuth HTTP 客户端。
///
/// OAuth code/token 交换同样需要对本地回环地址绕过代理。
pub(crate) fn oauth_client_for_origin(origin: &str) -> Result<Client, reqwest::Error> {
    instance_client_builder_for_origin(origin)
        .redirect(redirect::Policy::none())
        .build()
}

fn instance_client_builder() -> ClientBuilder {
    Client::builder().danger_accept_invalid_certs(true)
}

fn instance_client_builder_for_origin(origin: &str) -> ClientBuilder {
    let builder = instance_client_builder();

    if should_bypass_proxy(origin) {
        return builder.no_proxy();
    }

    builder
}

fn should_bypass_proxy(origin: &str) -> bool {
    let Ok(url) = Url::parse(origin) else {
        return false;
    };

    let Some(host) = url.host_str() else {
        return false;
    };

    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }

    host.parse::<IpAddr>()
        .map(|ip| ip.is_loopback())
        .unwrap_or(false)
}
