use axum::Router;

// 模块路径导入写法,等价于
// use crate::http::routes::oauth_dev_callback;
// use crate::http::state::HttpServerState;
use crate::http::{routes::oauth_dev_callback, state::HttpServerState};

pub(crate) fn build_router(state: HttpServerState) -> Router {
    Router::new()
        .merge(oauth_dev_callback::routes())
        .with_state(state) // 注入共享状态
}
