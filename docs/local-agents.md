# Luna 本地 Agent

Electron 桌面客户端集成本机 Codex、Claude Code 和 Pi，提供独立的对话窗口、流式输出、工具审批和停止生成。普通 Web 页面不启动本地进程。

本地 Agent 功能不依赖本站 MCP 开关或 AI 助手服务。Luna 不添加 MCP 服务器、不代理 MCP 请求，也不管理 MCP OAuth 授权；Agent 自身已有的配置由对应 CLI 处理。模型账户、服务地址和模型凭据使用 CLI 现有配置，Luna 不保存这些凭据。

## 使用方式

1. 在本机安装并登录需要使用的 Agent。检测安装只验证程序和版本，不代表模型账户已经登录。
2. 在工作区打开本地 Agent 窗口，配置名称、引擎、可执行文件和工作目录，可选填模型。程序路径支持绝对路径或 PATH 命令，不支持拼接 shell 参数。
3. 新建对话并选择 Agent。每段对话固定一个配置，多个对话可以独立运行。
4. 在窗口中发送消息、查看输出、处理工具审批或停止生成。

工具运行在本机和指定的工作目录中。工作目录留空时使用本机用户主目录。停止或关闭对话不会撤销已经完成的本地操作。

## 运行接口与权限

| 引擎 | 本地接口 | 工具审批 |
| --- | --- | --- |
| Codex | `app-server`，JSON-RPC stdio | 转发原生命令和文件修改审批，使用 `untrusted` 和 `workspace-write` 策略 |
| Claude Code | 双向 `stream-json` | 使用默认权限策略，通过 stdio 回复工具审批 |
| Pi | `--mode rpc` | 通过原生扩展的工具事件和 RPC 确认对话框处理审批 |

Pi 需要支持原生扩展、RPC UI 和 `agent_settled` 事件。当前聊天支持允许/拒绝式审批，未支持的原生输入表单会明确取消。

主进程管理子进程及窗口归属，配置按站点与账户隔离。切换账户、退出或登录失效时清理相应 Agent，其他账户和独立运行的 CLI 不受影响。锁屏会停止相关 Agent，解锁后可新建对话。

收起 Agent 窗口会保留对话。主窗口因未保存编辑取消关闭时，Agent 继续运行。对话与草稿在客户端运行期间保留，重启后清空；单个对话最多保留 2,000 条事件和约 200 万字符。

## 验证

```bash
pnpm --dir electron test:agents
pnpm exec vitest run --config vitest.config.ts --browser.enabled=false ui/composables/useLocalAgents.test.ts ui/store/modules/userInfo.test.ts ui/composables/useAuthSession.test.ts
pnpm typecheck
```

适配器测试使用真实子进程验证原生协议，覆盖初始化、流式消息、审批、取消和进程退出。可通过 `LUNA_CODEX_SMOKE_BIN`、`LUNA_CLAUDE_SMOKE_BIN` 和 `LUNA_PI_SMOKE_BIN` 指定本机 CLI，额外验证原生初始化；这些检查不向模型发送提示词。
