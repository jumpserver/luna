use std::collections::HashMap;
use std::sync::RwLock;

const CURRENT_SESSION_KEY: &str = "current_session_key";

#[derive(Default)]
pub struct ApiSessionStore {
    values: RwLock<HashMap<String, String>>,
}

#[derive(Debug, Clone)]
pub struct ApiSessionContext {
    pub origin: String,
    pub bearer_token: String,
    pub org_id: String,
}

impl ApiSessionStore {
    /// 设置当前站点、账号、Token 和组织上下文
    pub fn set_current_session(
        &self,
        session_key: String,
        origin: String,
        bearer_token: String,
        org_id: String,
    ) {
        let mut values = self.values.write().expect("api session lock poisoned");

        values.insert(CURRENT_SESSION_KEY.to_string(), session_key.clone());
        values.insert(Self::field_key(&session_key, "origin"), origin);
        values.insert(Self::field_key(&session_key, "bearer_token"), bearer_token);
        values.insert(Self::field_key(&session_key, "org_id"), org_id);
    }

    /// 更新当前会话使用的组织 ID
    pub fn set_current_org(&self, org_id: String) -> Result<(), String> {
        let mut values = self.values.write().expect("api session lock poisoned");
        let session_key = values
            .get(CURRENT_SESSION_KEY)
            .cloned()
            .ok_or_else(|| "missing current api session".to_string())?;

        values.insert(Self::field_key(&session_key, "org_id"), org_id);
        Ok(())
    }

    /// 更新当前会话保存的 bearer token
    pub fn update_current_bearer_token(&self, bearer_token: String) -> Result<(), String> {
        let mut values = self.values.write().expect("api session lock poisoned");
        let session_key = values
            .get(CURRENT_SESSION_KEY)
            .cloned()
            .ok_or_else(|| "missing current api session".to_string())?;

        values.insert(Self::field_key(&session_key, "bearer_token"), bearer_token);
        Ok(())
    }

    /// 读取当前会话上下文，缺少任一关键字段时返回 None
    pub fn current_context(&self) -> Option<ApiSessionContext> {
        let values = self.values.read().expect("api session lock poisoned");
        let session_key = values.get(CURRENT_SESSION_KEY)?.clone();

        Some(ApiSessionContext {
            origin: values
                .get(&Self::field_key(&session_key, "origin"))?
                .clone(),
            bearer_token: values
                .get(&Self::field_key(&session_key, "bearer_token"))?
                .clone(),
            org_id: values
                .get(&Self::field_key(&session_key, "org_id"))?
                .clone(),
        })
    }

    /// 生成 HashMap 中某个会话字段的内部 key
    fn field_key(session_key: &str, field: &str) -> String {
        format!("session:{}:{}", session_key, field)
    }
}
