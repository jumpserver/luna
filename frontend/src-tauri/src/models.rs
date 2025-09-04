use serde::Serialize;

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CookieMessage {
    pub(crate) name: String,
    pub(crate) value: String,
    pub(crate) domain: String,
    pub(crate) path: String,

    pub(crate) secure: bool,
    pub(crate) http_only: bool,
}

impl CookieMessage {
    /// 将cookie转换为HTTP请求头格式 (name=value)
    pub fn to_header_format(&self) -> String {
        format!("{}={}", self.name, self.value)
    }

    /// 检查这个cookie是否是认证相关的重要cookie
    pub fn is_auth_cookie(&self) -> bool {
        let name = self.name.to_lowercase();
        name.contains("session")
            || name.contains("csrf")
            || name.contains("token")
            || name.contains("auth")
    }
}

/// 将cookie数组转换为HTTP Cookie头字符串
pub fn cookies_to_header(cookies: &[CookieMessage]) -> String {
    cookies
        .iter()
        .map(|c| c.to_header_format())
        .collect::<Vec<_>>()
        .join("; ")
}
