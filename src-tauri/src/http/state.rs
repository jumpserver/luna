use tauri::AppHandle;

#[derive(Clone)]
pub(crate) struct HttpServerState {
    app_handle: AppHandle,
}

// 将 app_handle 注册为共享状态是由于需要从 app_handle 中取出 Auth 数据
// axum route 被浏览器通过 HTTP 调用时，只会收到 HTTP 请求上下文，不会自动有 Tauri 上下文
// 所以要主动把 AppHandle 放进 axum 的 State
impl HttpServerState {
    pub(crate) fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    pub(crate) fn app_handle(&self) -> &AppHandle {
        &self.app_handle
    }
}
