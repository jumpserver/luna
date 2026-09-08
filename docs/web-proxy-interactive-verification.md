# Web Proxy 人工验证

Web 资产新增可选字段 `interactive_selector`，用于 Electron 内置 Web Proxy 的登录期间人工验证。

本文介绍基础代填模式。高级脚本中的 `interactive` / `success`、同域多页登录和跨域 SSO 参见 [高级登录脚本](web-proxy-script-login.md)。

示例配置：

```text
username_selector: name=username
password_selector: name=password
submit_selector: id=login_button
success_selector: css=#dashboard
interactive_selector: css=#mfa-dialog
```

选择器沿用 `kind=value` 格式，支持 `name`、`id`、`type`、`class_name`、`css`、`css_selector`、`xpath`。资产字段最大长度为 128。`interactive_selector` 和 `success_selector` 均非必填，可以独立留空，也可以在编辑时清空。

- 两者均未配置：保留原有代填提交流程。
- 只配置 `success_selector`：等待登录成功标记。
- 只配置 `interactive_selector`：仅在验证区域实际出现时暂停，让用户操作后点击“完成交互”；没有验证码时自动提交，登录表单消失并稳定后继续会话。
- 两者均配置：自动提交前先检测验证区域，出现时等待用户操作；提交后继续检测验证码和成功标记，检测到可见成功标记后继续会话。

选择验证面板本身，包含短信发送、验证码输入、错误提示、确认按钮或滑块。排除账号、密码及显示密码、复制凭据等控件。当前只匹配一个区域，不支持选择整个 body/html。

## 运行行为

- 账号密码仍由原有一次性凭据接口代填。新配置由资产详情 `spec_info` 经 Luna 传入 Electron，不需要修改 Koko 的凭据接口。
- 配置交互区域不会强制等待验证码。代填后，验证区域已可见时暂不点击 `submit_selector`；区域未出现时正常提交一次，提交后仍检测验证区域，兼容登录失败后才出现验证码的页面。识别到验证区域后进入最长 3 分钟的人工验证；错误后可重新输入或发送短信，不重复领取凭据，也不因画面刷新延长截止时间。提交按钮可以在验证码完成前保持禁用。
- 整个目标页面保持隐藏，仅向 Luna 发送通过检查的验证区域截图。操作仍交给原页面的控件处理，包括连续鼠标拖拽。
- 验证画面同步控件光标：输入框显示文本光标，按钮显示手形，滑块保留抓取和拖拽样式。提交后显示登录进度，登录完成后移除验证提示。
- 输入由主进程校验范围、会话、页面及画面版本，再由独立 JavaScript world 校验真实目标与焦点。保护区优先：包含或覆盖账号密码时整个区域暂停开放。原凭据节点在代填前保留引用，改名不会解除保护。
- 区域变化、导航、后台、关闭或超时会撤回画面、拒绝旧输入并取消未完成拖拽。进入人工验证后提供“完成交互”按钮，点击后先提交账号密码及验证码，之后才清理代填值、恢复当前页面与录像；有成功标记时等待标记出现后再清理。区域消失本身不会结束验证。
- “返回”只收起验证区域并暂停区域输入；“继续验证”恢复同一个页面，保留账号密码、验证码和会话。收起不延长验证期限。验证面板没有结束会话按钮，结束会话仍通过工作区标签的关闭操作进行。
- 验证期间暂停录像，输入内容不写日志、不保存。键盘 Tab 在验证控件中切换，Escape 退出本地输入；允许粘贴验证码，支持输入法，并提供区域文本及焦点标签供辅助技术使用。

## 当前边界

仅支持同一主页面 DOM 中、能够完整放入视口的区域。含 iframe、Shadow DOM、嵌入对象的区域暂不开放，需要先实现对应文档的保护。鼠标驱动的滑块已有真实 Electron 回归；具体第三方 CAPTCHA 仍需要在真实网站验证，不能保证普遍兼容。

未配置成功标记且未进入人工验证时，使用登录表单消失并稳定 500 毫秒作为自动结束依据。登录后仍保留可见登录表单的网站需要配置 `success_selector`。

区域限制针对客户端用户操作，不是对恶意网站脚本的凭据隔离保证；目标站本身必须可信。网站收到代填值后，其脚本仍可读取这些值。

## 涉及仓库与启用

- JumpServer：Web 模型、资产/详情序列化、协议默认值和 `assets/0026_web_interactive_selector.py` 迁移。
- Lina：资产创建编辑、平台协议配置、默认值复制和列表字段排除。
- Luna：配置传递、验证画面、输入限制、状态与录像生命周期。

部署时需要应用新的数据库迁移并更新后端与 Lina、Luna 客户端。本次代码验证没有对已有数据库执行迁移。

## 回归检查

在 Luna 根目录执行：

```sh
pnpm --dir electron exec node --import tsx --test tests/web-proxy.test.ts
pnpm --dir electron run test:web-proxy:interaction
pnpm exec vitest run --browser.enabled=false ui/composables/useWebProxyManager.test.ts ui/workspaces/WebProxySessionSurface.test.ts
pnpm typecheck
```

真实 Electron 检查会短暂打开本地测试窗口，覆盖始终无验证码、预先显示验证码、失败后才显示验证码、禁用的提交按钮、发送短信、验证码重试、滑块、受保护控件改名、焦点、坐标变化、收起恢复、嵌入文档拒绝，以及凭据和验证码一起提交、成功后清理与清理失败时拒绝放行。
