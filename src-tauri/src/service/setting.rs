use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};

pub struct SettingService {
    api: ApiRequestClient,
}

impl SettingService {
    /// 创建偏好设置服务，复用 command 层从当前会话构建好的 API 客户端
    pub fn new(api: ApiRequestClient) -> Self {
        Self { api }
    }

    /// 获取 Luna 分类下的用户偏好设置
    pub async fn get_setting(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::user::LUNA_PREFERENCE);
        self.api.get_with_response(&url).await
    }
}
