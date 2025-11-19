use crate::commands::requests::{get_with_response, ApiResponse};
use serde::Serialize;
use serde_json::json;

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
        log::info!("获取用户 profile 信息: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn get_permission_orgs(&self) -> ApiResponse {
        let url = format!("{}/api/v1/users/profile/permissions/", self.origin);
        log::info!("获取授权的组织: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn get_current_org(&self) -> ApiResponse {
        let url = format!("{}/api/v1/orgs/orgs/current/", self.origin);
        log::info!("获取当前组织信息: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn get_version_message(&self) -> ApiResponse {
        let url = format!("{}/api/v1/settings/client/versions/", self.origin);
        log::info!("获取当前版本信息: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn get_xpack_message(&self) -> ApiResponse {
        let url = format!("{}/api/v1/settings/public/", self.origin);
        log::info!("获取当前public信息: {}", url);
        get_with_response(&url, &self.cookie_header).await
    }

    pub async fn init(&self, profile: ApiResponse, fetch_orgs: bool) -> UserProfileData {
        if fetch_orgs {
            let (permission_orgs, current_org) =
                tokio::join!(self.get_permission_orgs(), self.get_current_org());

            UserProfileData {
                profile,
                current_org,
                permission_orgs,
            }
        } else {
            let permission_orgs = ApiResponse {
                status: 200,
                data: json!({
                    "pam_orgs": [],
                    "audit_orgs": [],
                    "console_orgs": [],
                    "workbench_orgs": [],
                    "id": "",
                    "username": "",
                })
                .to_string(),
                success: true,
            };

            let current_org = ApiResponse {
                status: 200,
                data: json!({
                    "id": "",
                    "name": "",
                    "is_root": false,
                    "is_default": false,
                    "is_system": false,
                    "comment": "",
                })
                .to_string(),
                success: true,
            };

            UserProfileData {
                profile,
                current_org,
                permission_orgs,
            }
        }
    }
}
