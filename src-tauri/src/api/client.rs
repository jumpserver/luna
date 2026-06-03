use reqwest::{redirect, Client, ClientBuilder};

/// 构建用于 JumpServer API 请求的默认 HTTP 客户端
///
/// 当前行为故意接受无效证书，因为现有代码支持自签名证书或其他非公开证书
pub(crate) fn api_client() -> Result<Client, reqwest::Error> {
    instance_client_builder().build()
}

/// 构建一个用于 OAuth 请求的 HTTP 客户端，该客户端不允许重定向。
///
/// 目前，OAuth 代码交换需要禁用重定向处理，同时仍需保持与普通 API 请求相同的证书行为
pub(crate) fn oauth_client() -> Result<Client, reqwest::Error> {
    instance_client_builder()
        .redirect(redirect::Policy::none())
        .build()
}

fn instance_client_builder() -> ClientBuilder {
    Client::builder().danger_accept_invalid_certs(true)
}
