# Design QA

- Scope: Koko Terminal AI 的 Web/桌面 Cmd/Ctrl + K 轻量输入入口及 Xterm 光标提示。
- Visual target: `/Users/zhaojisen/Desktop/ai-command-spec.html` 仅作为浮层尺寸、光标定位与主题表现参考。
- Runtime boundary: 入口由当前 pane 的 Koko `data-capability.enabled` 和 WebSocket 状态决定，不依赖 Tauri 或终端协议判断。

## Review

- Geometry: 浮层默认宽度 520px、最小宽度 280px，与光标和终端边缘保持 8px 间距；下方空间不足时翻转到光标上方。
- Discoverability: 提示跟随 Xterm buffer 光标，位于光标右侧 6px，并保持 pointer-transparent。
- Interaction: 浮层无遮罩；Esc/点击外部只关闭浮层并保留 session 草稿；提交后打开右侧 Terminal AI。
- Session ownership: 浮层和右侧面板共用 Koko pane session、draft 与 `CHAT_MESSAGE`；任务忙碌或等待审批时快捷键直接打开右侧面板。
- Policy ownership: 快捷入口不展示或修改审批策略，计划、ACL、审批、执行、结果和中断均由现有 Terminal AI 面板处理。
- Theme consistency: 表面、边框、前景、弱化文字、终端前景和错误态均使用现有语义 token，无独立明暗主题分支。
- Removed states: 设计稿中的本地来源、模型、命令 Proposal、风险标签和确认执行状态不再属于快捷入口。

Implementation review: passed. Runtime screenshot comparison was not run in this change.
