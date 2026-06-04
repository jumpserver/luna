use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};

pub struct DetailService {
    api: ApiRequestClient,
    asset_id: String,
}

impl DetailService {
    /// 创建资产详情服务，复用 command 层从当前会话构建好的 API 客户端
    pub fn new(api: ApiRequestClient, asset_id: String) -> Self {
        Self { api, asset_id }
    }

    /// 获取指定资产的详情信息
    pub async fn get_asset_detail(&self) -> ApiResponse {
        let path = endpoint::assets::detail(&self.asset_id);
        let url = self.api.endpoint(&path);
        self.api.get_with_response(&url).await
    }
}
