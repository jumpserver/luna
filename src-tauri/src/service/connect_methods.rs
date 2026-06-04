use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};

pub struct ConnectMethodsService {
    api: ApiRequestClient,
}

impl ConnectMethodsService {
    /// 创建连接方式服务，复用 command 层从当前会话构建好的 API 客户端
    pub fn new(api: ApiRequestClient) -> Self {
        Self { api }
    }

    /// 获取当前组织可用的连接方式
    pub async fn get_connect_methods(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::terminal::CONNECT_METHODS);
        self.api.get_with_response(&url).await
    }
}
