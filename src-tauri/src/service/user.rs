use crate::commands::requests::{get_with_response, ApiResponse};
use log::info;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct UserProfileData {
    pub profile: ApiResponse,
    pub permission_orgs: ApiResponse,
    pub current_org: ApiResponse,
}
pub struct UserService {
    origin: String,
    cookie_header: String,
}

impl UserService {
    pub fn new(origin: String, cookie_header: String) -> Self {
        Self {
            origin,
            cookie_header,
        }
    }

    pub async fn get_user_profile(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/profile/", self.origin);
        info!("获取用户 profile 信息: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn get_permission_orgs(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/profile/permissions/", self.origin);
        info!("获取授权的组织: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn get_current_org(&self) -> ApiResponse {
        let url = format!("{}/api/v1/orgs/orgs/current/", self.origin);
        info!("获取当前组织信息: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn get_version_message(&self) -> ApiResponse {
        let url = format!("{}/api/v1/settings/client/versions/", self.origin);
        info!("获取当前版本信息: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn init(&self) -> UserProfileData {
        let (profile, permission_orgs, current_org) = tokio::join!(
            self.get_user_profile(),
            self.get_permission_orgs(),
            self.get_current_org()
        );

        UserProfileData {
            profile,
            permission_orgs,
            current_org,
        }
    }
}
