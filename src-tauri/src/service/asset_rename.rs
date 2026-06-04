use crate::api::{
    endpoint,
    request::{ApiRequestClient, ApiResponse},
};
use serde::Serialize;

#[derive(Serialize)]
pub struct RenameBody {
    asset: String,
    name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    oid: String,
}

pub struct RenameService {
    asset_id: String,
    name: String,
    api: ApiRequestClient,
    oid: String,
}

impl RenameService {
    /// 创建资产重命名服务，复用 command 层从当前会话构建好的 API 客户端
    pub fn new(api: ApiRequestClient, asset_id: String, name: String, oid: String) -> Self {
        Self {
            api,
            asset_id,
            name,
            oid,
        }
    }

    /// 提交资产重命名请求
    pub async fn rename(&self) -> ApiResponse {
        let url = self.api.endpoint(endpoint::assets::MY_ASSET);

        let body = RenameBody {
            asset: self.asset_id.clone(),
            name: self.name.clone(),
            oid: self.oid.clone(),
        };

        self.api.post_json_with_response(&url, &body).await
    }
}
