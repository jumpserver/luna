# Lion connector

Lion 是 RDP/VNC 远程桌面 connector，结构与 koko 对齐：

- `views/` — 独立页面（`/lion/connect`、`/lion/share`、`/lion/monitor`）
- `workspaces/` — 内嵌到 Luna workspace 的 session surface
- `shared/connectors/capabilities.ts` — 声明 `web_rdp_native` 连接方式
- `shared/connectors/registry.ts` — 解析到 `RemoteSessionSurface.vue`

开发代理见根目录 `nuxt.config.ts`：`/lion/`、`/lion/ws/` 转发到 `localhost:8081`。API/WS 固定走站点根路径 `/lion/*`（不带 `/luna` 前缀）。
