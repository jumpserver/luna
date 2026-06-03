use crate::api::request::{ApiRequestClient, ApiResponse};

pub struct UserService {
    origin: String,
    api: ApiRequestClient,
}

impl UserService {
    pub fn new(origin: String, bearer_token: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            origin,
            api: ApiRequestClient::new(bearer_token, String::new())?,
        })
    }

    pub async fn get_user_profile(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/profile/", self.origin);
        log::info!("获取用户 profile 信息: {}", url);
        self.api.get_with_response(&url).await
    }

    pub async fn get_permission_orgs(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/profile/permissions/", self.origin);
        log::info!("获取授权的组织: {}", url);
        self.api.get_with_response(&url).await
    }

    pub async fn get_current_org(&self) -> ApiResponse {
        let url = format!("{}/api/v1/orgs/orgs/current/", self.origin);
        log::info!("获取当前组织信息: {}", url);
        self.api.get_with_response(&url).await
    }

    pub async fn get_xpack_message(&self) -> ApiResponse {
        let url = format!("{}/api/v1/settings/public/", self.origin);
        log::info!("获取当前public信息: {}", url);
        self.api.get_with_response(&url).await
    }
}
