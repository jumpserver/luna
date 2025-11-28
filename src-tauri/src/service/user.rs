use crate::commands::requests::{get_with_response, ApiResponse};

#[derive(Clone)]
pub struct UserService {
    origin: String,
    bearer_token: String,
}

impl UserService {
    pub fn new(origin: String, bearer_token: String) -> Self {
        Self {
            origin,
            bearer_token,
        }
    }

    pub async fn get_user_profile(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/profile/", self.origin);
        log::info!("获取用户 profile 信息: {}", url);
        get_with_response(&url, &self.bearer_token).await
    }

    pub async fn get_permission_orgs(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/profile/permissions/", self.origin);
        log::info!("获取授权的组织: {}", url);
        get_with_response(&url, &self.bearer_token).await
    }

    pub async fn get_current_org(&self) -> ApiResponse {
        let url = format!("{}/api/v1/orgs/orgs/current/", self.origin);
        log::info!("获取当前组织信息: {}", url);
        get_with_response(&url, &self.bearer_token).await
    }

    pub async fn get_version_message(&self) -> ApiResponse {
        let url = format!("{}/api/v1/settings/client/versions/", self.origin);
        log::info!("获取当前版本信息: {}", url);
        get_with_response(&url, &self.bearer_token).await
    }

    pub async fn get_xpack_message(&self) -> ApiResponse {
        let url = format!("{}/api/v1/settings/public/", self.origin);
        log::info!("获取当前public信息: {}", url);
        get_with_response(&url, &self.bearer_token).await
    }
}
