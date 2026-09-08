# JumpServer WebLite applet

Luna 工作区中的独立 Electron 浏览器，用于替换内置 Chrome applet。Tinker 仍负责 RemoteApp 启动，浏览器直接复用 `packages/web-proxy` 的代填、登录脚本、交互区域、成功 selector 和安全输入控制。客户端也使用同一份实现。

## 默认链路

```text
Core 连接令牌 → Tinker 领取并消费令牌
                    ↓ 继承的 stdin 管道
              独立 Web applet → 发布机可访问的 Web 资产
                    ↑
              现有 RemoteApp / RDP 显示与录像
```

默认 `WEB_APPLET_RECORDING_ENABLED: false`。Applet 不连接 Koko、不启动自身 Web 录像，也不创建第二个 Web 审计会话。发布机必须能够访问资产和登录流程中的 SSO 地址。

Tinker 传入资产/平台的登录配置以及账号凭据；不再使用命令行或环境变量传递这些数据。主进程读取并校验启动管道，渲染进程只获得显示配置。凭据只允许在资产或脚本明确指定的 origin 领取一次，关闭、失败或完成登录时释放引用。每次启动使用独立临时 profile 和内存网站 session，可并发运行。

RDP 录像保持原有行为，会记录交互验证区域。Applet 中的账号密码保护继续生效；交互区不能与凭据输入区域重叠。

## 可选 Web 录像

发布机部署选项提供 `WEB_APPLET_RECORDING_ENABLED` 开关及 `WEB_PROXY_URL`。启用后，Applet 切换到客户端已有的 Koko 代理/代填/录像流程：Tinker 留下令牌供 Koko 消费，Koko 创建自己的 Web 审计会话。Web 录像启动失败会阻止网页加载，录像中断会关闭 Applet。

这一模式是额外的 Web 录像，保留已有 RDP 录像；两者是独立审计会话。默认直连模式没有这个额外会话。Koko 需要开启现有 `WEB_PROXY_ENABLED`、`WEB_PROXY_RECORDING_ENABLED` 并安装 ffmpeg。远程发布机访问代理时，需要配置可达监听地址和明确的允许目标（包含控制通道的 loopback 地址以及资产/SSO）；默认仅监听 loopback 的配置不能直接跨机器访问。

## 构建与验证

在 Luna 仓库根目录：

```sh
pnpm install --frozen-lockfile
pnpm applet:test
pnpm --dir applets/weblite typecheck
pnpm applet:build
pnpm --dir applets/weblite test:runtime
pnpm --dir electron test:web-proxy:interaction
pnpm applet:package
```

`test:runtime` 启动真实 Electron，使用本地测试站验证无 Koko 的基本/脚本登录、隐藏成功元素的处理、IPC 隔离和窗口退出，也用本地控制端点验证可选录像只启动一次。交互回归覆盖验证码输入、按钮点击、拖动、失败后再次验证及脚本流程。

Windows x64 包输出到 `release/applets/weblite-<version>-win32-x64.zip`，包含 `manifest.yml`、`icon.png`、`setup.yml` 和完整 `bin/` 运行时，无需安装 Chrome、ChromeDriver 或 Python 来运行这个 applet。其他 Python applet 继续使用 Tinker 原有入口。CI 的 Windows 构建会附带生成这个 ZIP。

## 联合发布

1. 构建并发布包含原生 `exec_type: exe` 支持的 Tinker 安装器。Core 部署清单当前以候选版本 `v0.3.0` 命名；这并不表示该版本已经发布。正式版本号变动时，应同时调整 Core 的 `TINKER_VERSION`。
2. 将 Web applet ZIP 提供到 Core 下载服务对应的 `/download/applets/weblite-4.1.2-win32-x64.zip`。内置 `setup.yml` 使用这个路径；升级版本时同步更新内置 manifest 和下载路径。也可直接上传完整 ZIP 安装。
3. 发布 Core 和 Lina 的配套变更。Core 默认安装 `weblite`，不再安装 Chrome applet 或 Chrome/ChromeDriver；迁移 `0012_retire_builtin_chrome` 停用已有内置 Chrome，保留其配置和发布记录。
4. 升级发布机 Tinker、发布 `weblite`，保持 Web 录像开关关闭，选择新连接方式验证。这里的本地构建不会执行数据库迁移、发布资源或升级 Windows 发布机。

首版沿用共享浏览器能力：支持主页面及同一窗口内的 SSO 跳转；旧 Chrome 的 `select_frame`、独立弹窗登录没有迁入，遇到不支持的脚本会明确失败。直连模式不自动建立资产网关隧道，需要发布机网络可达。Windows RemoteApp 的焦点、并发、实际 RDP 录像和发布机安装仍需在 Windows 环境联调。
