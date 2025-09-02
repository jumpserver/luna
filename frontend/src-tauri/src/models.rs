use serde::Serialize;

#[derive(Serialize, Clone, PartialEq)]
pub struct CookieMessage {
    pub(crate) name: String,
    pub(crate) value: String,
    pub(crate) domain: String,
    pub(crate) path: String,

    pub(crate) secure: bool,
    pub(crate) http_only: bool,
}