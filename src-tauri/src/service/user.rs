use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};

pub struct UserService {
    api: ApiRequestClient,
}

impl UserService {
    /// 创建用户服务，登录阶段不携带组织上下文
    pub fn new(origin: String, bearer_token: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            api: ApiRequestClient::with_origin(origin, bearer_token, String::new())?,
        })
    }

    /// 获取当前用户资料
    pub async fn get_user_profile(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::user::PROFILE);
        log::info!("获取用户 profile 信息: {}", url);
        self.api.get_with_response(&url).await
    }

    /// 获取当前用户有权限访问的组织列表
    pub async fn get_permission_orgs(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::user::PROFILE_PERMISSIONS);
        log::info!("获取授权的组织: {}", url);
        self.api.get_with_response(&url).await
    }

    /// 获取当前组织信息
    pub async fn get_current_org(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::org::CURRENT);
        log::info!("获取当前组织信息: {}", url);
        self.api.get_with_response(&url).await
    }

    /// 获取公开设置中的 X-Pack 信息
    pub async fn get_xpack_message(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::settings::PUBLIC);
        log::info!("获取当前public信息: {}", url);
        self.api.get_with_response(&url).await
    }
}
