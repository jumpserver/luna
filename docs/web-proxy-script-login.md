# Web Proxy 高级登录脚本

Web Proxy 支持同一窗口中的多页登录、SPA 页面切换，以及跨域 SSO。执行进度保存在 Electron 主进程，页面跳转不会从第一步重跑。基础代填继续使用原有 selector 字段；高级模式把人工验证和成功条件写进脚本。

## 导航行为

地址栏始终只读，不受安全模式开关影响。主进程也拒绝手动地址导航请求。登录后可以继续使用后退、前进、刷新。

登录中的 SSO 跨域重定向、表单跳转以及登录后的页面链接跳转，不做资产级域名限制，也无需另配资产白名单。仍只支持 HTTP/HTTPS 网页地址。安全模式原有的新窗口限制保留。

步骤中的 `origin` 用于定位执行页面及凭据填写位置，填写完整的 HTTP/HTTPS origin（协议、域名、可选端口），不支持路径、通配符或带账号密码的 URL。SSO 中仅用于中转的域不需要出现在脚本中；需要填写或操作元素的页面应在对应步骤中指定 `origin`。

Koko 现有部署级网络访问配置 `WEB_PROXY_ALLOWED_HOSTS` 仍然生效，SSO 和必要静态资源的主机需要在代理可访问的范围内。

## 脚本示例

业务站先重定向到认证站。认证站依次展示用户名页、密码页、人工验证页，最后返回业务站：

```json
[
  { "step": 1, "command": "type", "target": "id=username", "value": "{USERNAME}", "origin": "https://sso.example.com" },
  { "step": 2, "command": "click", "target": "id=next", "origin": "https://sso.example.com" },
  { "step": 3, "command": "type", "target": "id=password", "value": "{SECRET}", "origin": "https://sso.example.com" },
  { "step": 4, "command": "click", "target": "id=login", "origin": "https://sso.example.com" },
  { "step": 5, "command": "interactive", "target": "css=#mfa-dialog", "optional": false, "origin": "https://sso.example.com" },
  { "step": 6, "command": "click", "target": "id=verify", "origin": "https://sso.example.com" },
  { "step": 7, "command": "success", "target": "css=#dashboard" }
]
```

同域多页可以省略每一步的 `origin`。省略时始终使用资产 origin，不继承上一页；跨域步骤需要显式指定。`step` 为不重复的正整数，执行时按数字排序，最多 128 步。

| command            | 行为                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `type`             | 等待可见、可编辑的输入框，然后追加 `value`。支持 `{USERNAME}`、`{SECRET}`，替换后的值仅传给当前步骤。         |
| `click` / `button` | 等待可见、可用的目标并点击。下一步重新等待自己的元素，适配整页跳转和 SPA。                                    |
| `open`             | 打开 `value`，为空时使用 `target`。支持绝对 URL，或相对该步骤 origin 的路径；目标必须是有效 HTTP/HTTPS 地址。 |
| `interactive`      | 页面就绪后，`target` 可见时展示验证区域并暂停；不存在或隐藏则立即跳过。设置 `optional: false` 时必须等待目标出现。用户点击“完成交互”后继续，不额外提交或清空字段。 |
| `code`             | 兼容旧验证码步骤：通过目标输入框的受控交互区域输入验证码，完成后继续。                                        |
| `check`            | 等待目标元素可见，可以用于中间页面的条件检查。                                                                |
| `success`          | 等待最终页面上的目标可见，确认登录成功；必须是最后一步。已在成功页时不重新执行代填。                          |
| `sleep`            | `target` 为等待秒数，支持 0–30 秒。通常由元素等待替代固定延时。                                               |

`optional` 仅用于 `interactive`，必须是 JSON 布尔值。省略或填写 `true` 表示可选：页面就绪且目标不存在或隐藏时立即跳过，不等待超时；填写 `false` 表示必需：等待目标出现，超时则终止脚本。页面跳转或加载期间不会将旧页面或尚未就绪的页面判定为“没有验证码”。两种配置在目标出现后都必须完成人工交互，后续提交及成功检查仍须满足。旧 `code` 步骤仍要求验证码目标出现。

例如用户名、密码之后的可选验证码可以写为：

```json
{ "step": 3, "command": "interactive", "target": "css=div.captcha-field", "optional": true }
```

元素查找沿用 `kind=value`，支持 `name`、`id`、`type`、`class_name`、`css`、`css_selector`、`xpath`。普通步骤、页面就绪及必需验证区域检测默认最多等待 20 秒；检测到验证区域后，人工验证默认等待 180 秒。可用 `timeout` 指定 1–180 秒，同时覆盖该步骤的等待及人工验证时限；它不改变 `optional` 的含义。对于页面就绪后才异步出现、且必须完成的验证码，使用 `optional: false`。单次脚本总时限 10 分钟，收起验证区域或切换标签不会延长时限。首次领取凭据仍受 Koko 一次性凭据的有效期限制。

没有 `success` 时，结束状态仅表示“脚本执行完成”，不声称认证成功。步骤条件超时、无效地址跳转、凭据清理失败时保留遮罩，不开放目标页面。导航过程中无法确认结果的点击不会自动重放，后续条件不满足时需要重新连接。

## 凭据与交互生命周期

- Koko 从服务端连接令牌获取脚本，凭据接收域自动取自使用账号密码占位符的 `type` 步骤；基础模式仍限于资产自身 origin。页面跳转不会扩大凭据填写范围。
- 凭据最多领取一次，在主进程内跨页使用；每次填写前同时核对步骤 origin 与当前文档。执行期间页面隐藏、录像暂停。
- 每个代填节点保留原始引用，改名不会解除保护。人工验证区域不能包含或覆盖代填节点。翻页及成功结束时清理已填写字段；结束、关闭或超时后释放主进程凭据引用。
- 验证区域沿用基础模式的受控截图与输入机制。旧页面、旧区域、上一轮验证画面的输入均会失效。
- 当前仅支持主页面中的元素及验证区域。`select_frame`、iframe 内操作、Shadow DOM 验证和独立弹窗登录不支持；未知命令会在执行前报错，不会跳过。没有开放任意 JavaScript/Python 执行能力。

## 部署与验证

需要同时更新 JumpServer、Lina、Koko 和 Luna Electron。脚本使用现有 JSON 字段，不新增域名配置或数据库迁移；基础交互选择器仍依赖此前的 `0026_web_interactive_selector`。本次实现不自动执行数据库迁移。

```sh
pnpm --dir electron exec node --import tsx --test tests/web-proxy.test.ts
pnpm --dir electron run test:web-proxy:interaction
pnpm --dir electron typecheck
```

真实 Electron 回归覆盖同域三页登录、跨 origin SSO 往返及未出现在脚本中的中转域、一次领取凭据、人工验证后继续、SPA 切换、字段改名后清理、已有登录态、登录后跨域链接跳转、超时和取消。具体生产 SSO、验证码供应商仍需使用对应资产配置验证。
