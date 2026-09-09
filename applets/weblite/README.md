# JumpServer WebLite

Luna 工作区中的独立 Electron 浏览器，用于替换内置 Chrome。Tinker 仍负责 RemoteApp 启动，浏览器直接复用 `packages/web-proxy` 的代填、登录脚本、交互区域、成功 selector 和安全输入控制。客户端也使用同一份实现。Applet 清单及其发布包由 `jumpserver/terminal/applets` 维护；本仓库只构建可部署的 WebLite 应用安装包。

直接运行 `weblite.exe` 且不传入 Tinker 启动管道时，会打开轻量浏览模式。地址栏支持输入 HTTP/HTTPS 地址，并保留后退、前进和刷新；该模式不读取账号凭据、不连接 Koko，也不启用 Web 录像。收到 Tinker 启动参数时，地址栏仍保持只读，并继续执行资产白名单与安全登录约束。

## 默认链路

```text
Core 连接令牌 → Tinker 领取并消费令牌
                    ↓ 继承的 stdin 管道
                WebLite 应用 → 发布机可访问的 Web 资产
                    ↑
              现有 RemoteApp / RDP 显示与录像
```

默认 `WEB_APPLET_RECORDING_ENABLED: false`。WebLite 不连接 Koko、不启动自身 Web 录像，也不创建第二个 Web 审计会话。发布机必须能够访问资产和登录流程中的 SSO 地址。

Tinker 传入资产/平台的登录配置以及账号凭据；不再使用命令行或环境变量传递这些数据。主进程读取并校验启动管道，渲染进程只获得显示配置。凭据只允许在资产或脚本明确指定的 origin 领取一次，关闭、失败或完成登录时释放引用。每次启动使用独立临时 profile 和内存网站 session，可并发运行。

Website 资产的 `allowed_urls` 为可选访问白名单：留空允许所有站点；配置后只允许导航到资产地址所属站点和列表中的 HTTP/HTTPS origin（协议、主机、端口，不含路径或通配符）。同一策略用于页面链接、重定向、弹窗和登录脚本中的 `open`；子页面和图片、脚本等资源不受此导航策略限制。Tinker 通过启动管道传入该字段，桌面客户端通过资产详情传入，共用浏览器导航校验。Koko 代理默认允许所有目标，不把资产白名单作为全局代理限制。

RDP 录像保持原有行为，会记录交互验证区域。WebLite 中的账号密码保护继续生效；交互区不能与凭据输入区域重叠。

## 可选 Web 录像

发布机部署选项提供 `WEB_APPLET_RECORDING_ENABLED` 开关及 `WEB_PROXY_URL`。启用后，Applet 切换到客户端已有的 Koko 代理/代填/录像流程：Tinker 留下令牌供 Koko 消费，Koko 创建自己的 Web 审计会话。Web 录像启动失败会阻止网页加载，录像中断会关闭 Applet。

这一模式是额外的 Web 录像，保留已有 RDP 录像；两者是独立审计会话。默认直连模式没有这个额外会话。Koko 需要开启现有 `WEB_PROXY_ENABLED`、`WEB_PROXY_RECORDING_ENABLED` 并安装 ffmpeg。远程发布机访问代理时，需要配置可达监听地址和明确的允许目标（包含控制通道的 loopback 地址以及资产/SSO）；默认仅监听 loopback 的配置不能直接跨机器访问。

## 构建与验证

在 Luna 仓库根目录：

```sh
pnpm install --frozen-lockfile
pnpm weblite:test
pnpm --dir applets/weblite typecheck
pnpm weblite:build
pnpm --dir applets/weblite test:runtime
pnpm --dir electron test:web-proxy:interaction
pnpm weblite:package
```

`test:runtime` 启动真实 Electron，使用本地测试站验证无 Koko 的基本/脚本登录、隐藏成功元素的处理、IPC 隔离和窗口退出，也用本地控制端点验证可选录像只启动一次。交互回归覆盖验证码输入、按钮点击、拖动、失败后再次验证及脚本流程。

Windows x64 安装包输出到 `release/weblite/JumpServer-WebLite-<version>-x64.msi`。这是一个 per-machine MSI，会将完整运行时安装到 `Program Files`，无需预装 Chrome、ChromeDriver 或 Python。CI 只发布这个安装包，不附带 applet 的 `manifest.yml`、`setup.yml` 或独立图标文件。

## 联合发布

1. 构建并发布包含原生 `exec_type: exe` 支持的 Tinker 安装器。Core 部署清单当前以候选版本 `v0.3.0` 命名；这并不表示该版本已经发布。正式版本号变动时，应同时调整 Core 的 `TINKER_VERSION`。
2. 将 WebLite MSI 部署到 Windows 发布机。Applet 的清单、图标及安装对接由 `jumpserver/terminal/applets` 维护，不从 Luna 的 Action 产物生成。
3. 发布 Core 和 Lina 的配套变更。Core 默认安装 `weblite`，不再安装 Chrome applet 或 Chrome/ChromeDriver；迁移 `0012_retire_builtin_chrome` 停用已有内置 Chrome，保留其配置和发布记录。
4. 升级发布机 Tinker、发布 `weblite`，保持 Web 录像开关关闭，选择新连接方式验证。这里的本地构建不会执行数据库迁移、发布资源或升级 Windows 发布机。

首版沿用共享浏览器能力：支持主页面及同一窗口内的 SSO 跳转；旧 Chrome 的 `select_frame`、独立弹窗登录没有迁入，遇到不支持的脚本会明确失败。直连模式不自动建立资产网关隧道，需要发布机网络可达。Windows RemoteApp 的焦点、并发、实际 RDP 录像和发布机安装仍需在 Windows 环境联调。
