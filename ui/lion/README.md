# Lion connector

Lion 是 RDP/VNC 远程桌面 connector，结构与 koko 对齐：

- `views/` — 连接、监控与分享视图；分享入口统一为 `/luna/share/:id/?component=lion`
- `workspaces/` — 内嵌到 Luna workspace 的 session surface
- `shared/connectors/capabilities.ts` — 声明 `web_rdp_native` 连接方式
- `shared/connectors/registry.ts` — 解析到 `RemoteSessionSurface.vue`

开发代理见根目录 `nuxt.config.ts`：Lion 的 API、Token、Health 和 WebSocket 路径默认转发到 Koko（`JMS_KOKO_DEV_URL`，默认 `localhost:5050`）。`JMS_LION_DEV_URL` 仅作为兼容覆盖保留。页面路径由 Client 自己渲染，不转发给 Koko；Lion 独有的 API/WS 使用 `/koko/lion/*`，分享和监控的 WebSocket 分别使用 `/koko/ws/share/`、`/koko/ws/monitor/`，均不带 `/luna` 前缀。
