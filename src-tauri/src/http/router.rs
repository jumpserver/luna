use axum::Router;

use crate::http::{routes::oauth_callback, state::HttpServerState};

pub(crate) fn build_router(state: HttpServerState) -> Router {
    Router::new()
        .merge(oauth_callback::routes())
        .with_state(state) // 注入共享状态
}
