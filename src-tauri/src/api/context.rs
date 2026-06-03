use reqwest::RequestBuilder;

/// 请求通用上下文
pub struct ApiContext<'a> {
    pub bearer_token: &'a str,
    pub org_id: &'a str,
}

/// 请求上下文需要提供 Org 信息
pub trait OrgScoped {
    fn org(&self) -> &str;
}

impl<'a> OrgScoped for ApiContext<'a> {
    fn org(&self) -> &str {
        self.org_id
    }
}

/// 给请求追加 Org 相关的 Header
pub fn apply_org_header<T>(request: RequestBuilder, org_scoped: &T) -> RequestBuilder
where
    T: OrgScoped + ?Sized,
{
    request.header("X-JMS-ORG", org_scoped.org())
}
