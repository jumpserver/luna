# JumpServer WebLite

Luna 工作区中的独立 Electron 浏览器，用于替换内置 Chrome。Tinker 仍负责 RemoteApp 启动，浏览器直接复用 `packages/web-proxy` 的代填、登录脚本、交互区域、成功 selector 和安全输入控制。客户端也使用同一份实现。Applet 清单及其发布包由 `jumpserver/terminal/applets` 维护；本仓库只构建可部署的 WebLite 应用安装包。

直接运行 `weblite.exe` 且不传入 Tinker 启动管道时，会打开轻量浏览模式。地址栏支持输入 HTTP/HTTPS 地址，并保留后退、前进和刷新；该模式不读取账号凭据、不连接 Koko，也不启用 Web 录像。收到 Tinker 启动参数时，地址栏仍保持只读，并继续执行资产白名单与安全登录约束。

Applet 清单声明 `exec_type: exe` 和 `stdin: true`，接收通用 `AppletArgs` JSON。WebLite 从 `asset.address` 解析地址并自动打开、显示到地址栏；即使 `autofill` 为 `none`，也不需要手工输入地址。如果启动后显示 JumpServer 官网且地址栏可编辑，说明进入了独立浏览模式，应检查清单的 `stdin: true` 是否生效、Tinker 是否支持通用 JSON 启动管道。MSI 部署的清单必须指向 `app-<version>/weblite.exe`，根目录的 MSI 启动器不能保证保留管道。清单中的版本目录需与实际安装版本一致。

## 连接链路

```text
Core 连接令牌 → Tinker 领取并消费令牌
                    ↓ 通用 AppletArgs JSON / stdin 管道
                WebLite 应用 → 发布机可访问的 Web 资产
                    ↑
              现有 RemoteApp / RDP 显示与录像
```

通用 Applet 启动只使用直连模式。WebLite 不连接 Koko、不启动自身 Web 录像，也不创建第二个 Web 审计会话。发布机必须能够访问资产和登录流程中的 SSO 地址。

访问白名单、脚本模式、成功选择器和交互区域选择器属于 XPack 功能，需要有效的企业版许可证。基础代填不受影响。Core 在保存配置和验证连接令牌时检查许可证；无有效许可证时，使用已有高级配置的连接也会被拒绝，不会自动忽略白名单或验证区域。这些限制需要配套更新 Core、Lina 和 Luna。

Tinker 原样传入 `asset`、`account`、`platform` 等通用连接数据，不识别 Applet 名称、不组装 Web 专属参数。WebLite 优先使用 `asset.spec_info` 的登录配置，未设置代填模式时回退到对应平台协议配置；安全模式来自平台配置，匿名账号 `@ANON` 关闭代填。数据通过管道传入，不进入命令行或环境变量。主进程读取并校验启动管道，渲染进程只获得显示配置。凭据只允许在资产或脚本明确指定的 origin 领取一次，关闭、失败或完成登录时释放引用。每次启动使用独立临时 profile 和内存网站 session，可并发运行。

Website 资产的 `allowed_urls` 为可选访问白名单：留空允许所有站点；配置后只允许导航到资产地址所属站点和列表中的 HTTP/HTTPS origin（协议、主机、端口，不含路径或通配符）。同一策略用于页面链接、重定向、弹窗和登录脚本中的 `open`；子页面和图片、脚本等资源不受此导航策略限制。Tinker 通过启动管道传入该字段，桌面客户端通过资产详情传入，共用浏览器导航校验。

RDP 录像保持原有行为，会记录交互验证区域。WebLite 中的账号密码保护继续生效；交互区不能与凭据输入区域重叠。

## 启动兼容性

WebLite 保留旧的 `target_url` / `login` JSON 输入兼容，以便分阶段升级；新 Tinker 只按清单发送通用 `AppletArgs`。旧的代理和录像字段会被忽略，WebLite 始终直连资产，当前 Core/Tinker 不再提供 Web Proxy 地址或 Web 录像部署选项。

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

`test:runtime` 启动真实 Electron，使用本地测试站验证资产地址自动打开（含查询参数和片段）、Applet 地址栏只读、无账号代填和匿名账号的地址启动、平台配置回退、无 Koko 的基本/脚本登录、隐藏成功元素的处理、IPC 隔离和窗口退出，还会验证旧版代理/录像参数不会启用 Koko，渲染进程无法启动 Web 录像。交互回归覆盖验证码输入、按钮点击、拖动、失败后再次验证及脚本流程。

Windows x64 安装包输出到 `release/weblite/JumpServer-WebLite-<version>-x64.msi`。这是一个 per-machine MSI，会将完整运行时安装到 `Program Files/JumpServer/Weblite`，无需预装 Chrome、ChromeDriver 或 Python。CI 只发布这个安装包，不附带 applet 的 `manifest.yml`、`setup.yml` 或独立图标文件。

## 联合发布

1. 构建并发布支持清单 `exec_type: exe` 和 `stdin: true` 的 Tinker 安装器；正式发布时同步调整 Core 的 `TINKER_VERSION`，不能仅凭旧版本号判断支持情况。
2. 将 WebLite MSI 部署到 Windows 发布机。Applet 的清单、图标及安装对接由 `jumpserver/terminal/applets` 维护，不从 Luna 的 Action 产物生成。
3. 发布 Core 和 Lina 的配套变更。Core 默认安装 `weblite`，不再安装 Chrome applet 或 Chrome/ChromeDriver；迁移 `0012_retire_builtin_chrome` 停用已有内置 Chrome，保留其配置和发布记录。
4. 同时部署新版 Tinker、新版 WebLite 和含 `stdin: true` 的 Applet 清单，选择新连接方式验证。旧 WebLite 不识别通用参数，不能只更新 Tinker 和清单。这里的本地构建不会执行数据库迁移、发布资源或升级 Windows 发布机。

首版沿用共享浏览器能力：支持主页面及同一窗口内的 SSO 跳转；旧 Chrome 的 `select_frame`、独立弹窗登录没有迁入，遇到不支持的脚本会明确失败。直连模式不自动建立资产网关隧道，需要发布机网络可达。Windows RemoteApp 的焦点、并发、实际 RDP 录像和发布机安装仍需在 Windows 环境联调。
