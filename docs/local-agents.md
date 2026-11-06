# Luna 本地 Agent

Electron 客户端支持 Codex、Claude Code 和 Pi。本站开启 MCP 后，工作区标题栏显示 Agent 按钮；按钮打开独立窗口，首次使用在窗口内配置本机 Agent。每个对话固定一个配置，多个对话可以独立运行。

普通 Web 页面不启动本地进程。独立 Agent 页面保留客户端锁屏保护，但不执行工作区登录恢复、连接初始化或工作区快捷键。主窗口切换账户、退出或登录失效时释放相关 Agent；收起 Agent 窗口保留对话。主窗口因未保存的编辑取消关闭时，Agent 继续运行。

## 与外部 MCP 客户端并存

原有外接 MCP 能力保持独立可用。外部客户端继续直接连接 `MCP_PUBLIC_URL`，使用原有注册、OAuth 授权、令牌刷新和工具调用流程；无需安装、启动或登录 Luna，也无需经过 Luna 的本地代理。新增的 `agent_identity_endpoint` 仅供 Luna 校验授权账户，外部客户端无需调用。

Luna 使用自己的 OAuth 客户端和授权，本地 Agent 配置只作用于 Luna 启动的进程，不改写独立 CLI 的全局 MCP 配置。关闭对话、退出 Luna 或切换账户只清理相应本地进程与代理，不关闭服务端 MCP，也不撤销其他客户端的授权。服务端原有的权限、客户端数量限制和管理员禁用策略继续共同适用。

## 配置与使用

1. 在本机安装并登录需要使用的 Agent。Luna 复用 CLI 的模型凭据；“检测安装”只验证可执行程序和版本，不代表模型账户已登录。
2. 点击 Agent 按钮，保存名称、引擎、可执行文件、工作目录及可选模型。可执行文件可填绝对路径或 PATH 命令，不支持拼接 shell 参数。工作目录留空使用本机用户主目录。
3. 新建对话并选择配置。首次 MCP 授权会打开浏览器；使用与 Luna 相同的 JumpServer 账户完成授权。无需另外输入 MCP URL、OAuth Client ID 或 Token。
4. 消息、工具结果及审批在独立窗口展示。本站 MCP 的每次工具调用均由 Luna 审批，本机工具沿用对应引擎的权限机制；Pi 的本机工具通过扩展确认。拒绝审批不会向 Koko 提交工具执行。

配置按站点与账户持久化；OAuth 凭据使用 Electron safeStorage 和操作系统密钥存储加密。Linux 需要可用的系统密钥存储，不使用 basic_text 后端保存授权。对话与草稿保留到客户端退出，重启后清空；单个对话保留至多 2,000 条事件及约 200 万字符。

停止生成或关闭对话不能撤回已经在远端接受的操作。`execute_command` 返回 `action_id` 只表示已提交，应使用 `query_actions` 查询最终结果；结果不明时不会自动重放请求。Agent 使用 MCP 创建专用资产会话，不接管用户现有的终端、SQL 事务或连接页。

## 运行接口

| 引擎        | 本地接口                     | MCP 注入                                           | 已验证 CLI 版本 |
| ----------- | ---------------------------- | -------------------------------------------------- | --------------- |
| Codex       | `app-server`，JSON-RPC stdio | 本次进程的配置覆盖，凭据通过环境变量传递           | 0.166.0         |
| Claude Code | 双向 `stream-json` 控制协议  | 临时 MCP 配置文件，严格配置模式                    | 2.1.318         |
| Pi          | `--mode rpc`                 | 临时扩展调用原生 `registerMcpServer`，不改用户配置 | 1.5.0           |

这些版本完成了真实进程初始化与 MCP 工具发现验证；这不是对所有历史版本的兼容承诺。Pi 必须具备原生 MCP 和 `agent_settled` 事件。当前聊天仅支持允许/拒绝式审批，未支持的原生输入表单会明确取消。

Electron 主进程管理会话和子进程，通过现有 desktop bridge 向页面推送快照。每个会话的回环 HTTP 服务使用随机端口和随机 Bearer，仅转发本站 MCP；远端 OAuth 凭据不交给渲染器或 Agent。本站 MCP 的确认统一在该转发层完成，其他服务器或本机工具不获得额外权限。

Codex 仅对当前对话注入的随机 MCP 服务设置 `default_tools_approval_mode="approve"`，由 Luna 转发层逐次确认工具调用，避免连接资产等操作被额外的原生表单确认阻断。该设置只通过本次进程参数传入；其他 MCP 服务、本机工具的审批策略和用户配置保持不变。普通 MCP 表单及 URL 输入请求仍明确拒绝。配置字段见 [Codex 官方配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。

## 关联分支和服务端契约

| 仓库            | 分支                  | 配套内容                                     |
| --------------- | --------------------- | -------------------------------------------- |
| Luna            | `pr@dev@local-agents` | 独立窗口、运行适配、OAuth 与本地 MCP 转发    |
| JumpServer Core | `pr@dev@agent-mcp`    | MCP 配置、DCR、PKCE、身份校验、授权与审计    |
| Koko            | `pr@dev@agent-mcp`    | Streamable HTTP MCP 与资产操作；本次无需修改 |

Luna 通过当前客户端登录请求 `/api/v1/settings/public/`，读取 `MCP_ENABLED` 和准确的 `MCP_PUBLIC_URL`。新客户端注册需要服务端允许 DCR；关闭 DCR 不影响已有客户端授权和正常刷新。

OAuth 使用 `agent:access`、PKCE S256、精确 resource 和 `127.0.0.1` 回调。授权服务器必须属于当前登录的 Core 站点。Core 的发现元数据需包含本次增加的 `agent_identity_endpoint`：

```text
GET /core/auth/oauth2-provider/agent-identity/?resource=<准确的 MCP_PUBLIC_URL>
Authorization: Bearer <MCP access token>

200 {"sub": "<用户 UUID>"}
```

该接口只返回有效 Agent Token 的用户 ID，复用 MCP introspection 的存活、scope、resource、用户、组织与撤销检查；Cookie 不参与认证，Agent Token 仍不能访问普通 Core API。Luna 将 `sub` 与通过当前客户端会话读取的 `/api/v1/users/profile/` 的 `id` 比较，在新授权、刷新及加载已存凭据时验证。身份不符或旧 Core 缺少此接口时停止连接。因此需要同时部署本次 Core 分支更新。

## 验证

```bash
pnpm --dir electron test:agents
pnpm exec vitest run --config vitest.config.ts --browser.enabled=false ui/composables/useLocalAgents.test.ts ui/store/modules/userInfo.test.ts ui/composables/useAuthSession.test.ts
pnpm typecheck
```

`agent-adapters.test.ts` 使用真实子进程协议夹具，`agent-mcp.test.ts` 使用回环 HTTP OAuth/MCP 服务，覆盖授权、刷新、身份错配、拒绝、重定向、重复请求及关闭边界。可通过以下环境变量启用真实 CLI 初始化验证；测试不发送模型 prompt：

```bash
LUNA_CODEX_SMOKE_BIN=/absolute/path/to/codex \
LUNA_CLAUDE_SMOKE_BIN=/absolute/path/to/claude \
LUNA_PI_SMOKE_BIN=/absolute/path/to/pi \
pnpm --dir electron test:agents
```

真实部署验收需使用联调站点：分别创建三个引擎的对话，批准资产查询，拒绝一次命令执行，确认未执行；再验证浏览器使用其他账户时授权失败，以及断网停止、锁屏、切换账户和收起窗口。使用测试资产执行远端操作。HTTP 夹具、CLI 工具发现及 Core/Koko 单元测试不替代真实站点端到端验收；Windows 进程树清理仍需 Windows 实机验证。

外部客户端并存验收应使用独立 OAuth 授权及真实资产会话：先由外部客户端连接测试资产，再通过 Luna 窗口让真实 Agent 查询、连接和执行只读命令，期间外部客户端继续执行命令。正常退出整个 Luna 进程后，确认其 Agent 子进程和回环代理均已退出；外部客户端仍使用原授权、原 transport 和原资产会话执行命令，刷新令牌后再次执行。每次异步命令执行必须查询到成功终态和实际输出，并通过服务端审计核对双方独立的客户端及资产会话；不得通过重新授权或重新连接掩盖退出后的断连。

2026-11-07（北京时间）在 `ssh-buildx` 完成了上述真实联调：Linux Electron 44、系统 Secret Service、Codex 0.166.0 的真实模型调用，以及独立 MCP TypeScript SDK 1.32.2 客户端。内置 Agent 经六次 Luna 审批完成资产查询、连接、只读命令执行、结果查询和断开；外部客户端在并行调用、Luna 退出及令牌刷新后均从同一资产会话取得实际命令输出。此次真实模型验收覆盖 Codex；Claude Code、Pi 仍仅完成真实 CLI 初始化与工具发现验证，不代表已完成它们的模型端到端验收。
