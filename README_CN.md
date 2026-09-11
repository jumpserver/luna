<div align="center">

# 🚀 JumpServer 客户端

**基于 Electron 构建的现代化跨平台 JumpServer 桌面客户端**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/jumpserver/clients)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)

[English](README.md) | [中文](README_CN.md)

![JumpServer 客户端](public/screenshot.png)

</div>

---

## ✨ 特性

- 🎯 **跨平台支持** - 支持 macOS、Windows 和 Linux 原生应用
- 🔐 **安全连接** - 支持 SSH、RDP、VNC 和数据库协议
- 🗄️ **多数据库支持** - 支持 MySQL、PostgreSQL、Redis、MongoDB、Oracle、SQL Server、ClickHouse、达梦等
- 🖥️ **设备管理** - 无缝管理 Linux 和 Windows 服务器
- 🎨 **现代化界面** - 基于 Vue 3 和 Nuxt UI 构建的优雅响应式界面
- ⚡ **桌面集成** - 隔离的 Electron 运行时与 Node 桌面服务
- 🔗 **深度链接支持** - 通过自定义协议（`jms2://`）从浏览器直接启动连接
- 🌓 **主题支持** - 支持浅色和深色模式
- 🌍 **国际化** - 多语言支持（英文、中文）
- 📋 **剪贴板集成** - 便捷的复制粘贴功能
- 🔔 **通知** - 实时连接状态通知
- 💾 **持久化存储** - 保存您喜爱的连接和设置

## 🖼️ 截图

<div align="center">

![主界面](public/screenshot.png)

_主界面展示资产管理_

</div>

## 🛠️ 技术栈

### 前端

- **Vue 3** - 渐进式 JavaScript 框架
- **Nuxt UI** - 完全样式化和可自定义的组件

### 桌面端

- **Electron 44** - 跨平台窗口、原生集成与打包
- **Node.js** - SSH helper、录像处理与桌面服务
- **可选 FFmpeg 插件** - 在设置中按需下载，用于 H.264 录像编码，不依赖系统 FFmpeg

## 📦 安装

### macOS

1. 从 [Releases](https://github.com/jumpserver/clients/releases) 页面下载 `.dmg` 文件
2. 打开下载的 `.dmg` 文件
3. 将 `JumpServer.app` 拖拽到 `应用程序` 文件夹
4. 双击 `JumpServer.app` 启动（这将注册自定义协议）

### Windows

1. 从 [Releases](https://github.com/jumpserver/clients/releases) 页面下载 `.msi` 或 `.exe` 安装程序
2. 双击安装程序文件
3. 按照安装向导操作（可能需要 10-15 秒）
4. 从开始菜单启动 JumpServer 客户端

### Linux

#### Debian/Ubuntu (.deb)

```bash
# 下载 .deb 安装包
wget https://github.com/jumpserver/clients/releases/latest/download/jumpserver-client_*.deb

# 使用 dpkg 安装
sudo dpkg -i jumpserver-client_*.deb

# 或使用 apt 安装
sudo apt install ./jumpserver-client_*.deb
```

#### RPM 系列 (Red Hat, Fedora, CentOS)

```bash
# 下载 .rpm 安装包
wget https://github.com/jumpserver/clients/releases/latest/download/jumpserver-client_*.rpm

# 使用 rpm 安装
sudo rpm -i jumpserver-client_*.rpm

# 或使用 dnf/yum 安装
sudo dnf install ./jumpserver-client_*.rpm
```

## 🚀 使用

### 启动连接

1. **从 JumpServer Web 界面**：点击任何资产连接链接 - 客户端将自动启动
2. **从客户端**：浏览您的资产，选择连接，然后点击连接
3. **自定义协议**：使用 `jms2://` 链接以编程方式启动连接

### 支持的连接类型

- **SSH/Telnet** - 终端连接（PuTTY、XShell、SecureCRT、iTerm2）
- **RDP** - Windows 服务器的远程桌面协议
- **VNC** - 用于远程桌面访问的虚拟网络计算
- **数据库连接**：
  - MySQL
  - PostgreSQL
  - Redis
  - MongoDB
  - Oracle
  - SQL Server
  - ClickHouse
  - 达梦 (DM)

### 资产管理

- **收藏夹** - 将常用资产标记为收藏以便快速访问
- **搜索** - 通过名称或 IP 地址快速查找资产
- **分类** - 按类型组织资产（Linux、Windows、数据库）
- **重命名** - 自定义资产显示名称

## 🛠️ 开发

### 前置要求

- **Node.js** >= 24
- **pnpm** >= 11
- **系统依赖**：
  - macOS: Xcode Command Line Tools
  - Windows: Microsoft Visual C++ Build Tools；生成 MSI 时还需 WiX Toolset 3（`candle` 和 `light`）
  - Linux: `build-essential`、`fakeroot`，生成 DEB/RPM 安装包时还需安装 `rpm`

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/jumpserver/clients.git
cd clients

# 安装依赖
pnpm install

# 启动开发服务器
pnpm electron:dev
```

### 构建生产版本

```bash
# 为当前平台构建
pnpm electron:build

# 构建未打包的应用目录
pnpm electron:package:dir
```

### 构建 Web Docker 镜像

Docker 构建只安装 Web workspace 的依赖关系，并将生成的 Nuxt 静态产物写入 `/opt/luna`。Electron 代码及桌面原生依赖不会进入 Docker 构建上下文。

```bash
docker build -t jumpserver/luna:local .
```

Web 工作流会构建 `linux/amd64` 与 `linux/arm64` 双架构镜像，并在版本标签触发时发布到 `jumpserver/luna`。macOS、Linux 和 Windows 桌面客户端则由客户端发布工作流单独打包。

### 项目结构

```
clients/
├── ui/                    # 前端 (Vue/Nuxt)
│   ├── components/        # Vue 组件
│   ├── pages/            # 应用页面
│   ├── composables/      # Vue 组合式函数
│   └── layouts/          # 布局组件
├── electron/              # Electron 主进程与 preload bridge
│   ├── src/              # 按业务拆分的 TypeScript 桌面运行时
│   └── tests/            # Electron 单元测试与 fixtures
└── i18n/                 # 国际化文件
```

### 可用脚本

```bash
pnpm web:dev          # 启动 Nuxt Web 开发模式
pnpm electron:dev     # 启动 Electron 开发模式
pnpm electron:build   # 构建生产应用
make docker-build     # 构建 Web Docker 镜像
pnpm fmt              # 使用 Oxfmt 格式化前端代码
pnpm lint             # 运行代码检查
pnpm reset            # 清理构建产物
```

### 连接组件的开发代理

所有连接都使用 Core 返回的 endpoint。HTTP/HTTPS 端口为 `0` 时继承当前站点端口；明确配置的 host、端口或 URL 不会因开发模式或 loopback 地址而被替换。

本地开发运行 `pnpm dev`，Web 使用启动输出中的 Nuxt 地址，Electron 的登录站点也填写同一个地址（例如 `http://127.0.0.1:3000`）。默认 endpoint 经此入口分流：

| 路径                                                  | 默认后端                | 配置变量           |
| ----------------------------------------------------- | ----------------------- | ------------------ |
| `/api/`、`/core`                                      | `http://localhost:8080` | `JMS_CORE_DEV_URL` |
| `/koko/`（含终端、SFTP、Lion、监控的 HTTP/WebSocket） | `http://localhost:5050` | `JMS_KOKO_DEV_URL` |
| `/chen`（HTTP/WebSocket）                             | `http://localhost:8082` | `JMS_CHEN_DEV_URL` |

这些变量放在 `.env.development`，修改后重启开发进程。需要独立调试 Lion 时可用 `JMS_LION_DEV_URL` 覆盖 `/koko/lion/`。自定义 endpoint 需配置为开发代理入口，或其实际可访问的连接地址。

Electron 选择远端 JumpServer 站点时直接使用该站点的 endpoint。已移除 `JMS_KOKO_DESKTOP_URL`、`JMS_CHEN_DESKTOP_URL`、`VITE_JMS_WEB_PROXY_URL` 和 `VITE_JMS_WEB_PROXY_PORT` 地址覆盖。

Web Proxy 使用 endpoint 的独立 `web_proxy_port`（旧服务端缺少该字段时使用 `5001`），不经过 `/koko/` 反向代理。它和本地 Koko/Chen 必须连接签发 token 的同一 Core。代理配置可用 `node scripts/check-ws-proxy.mjs` 检查。

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m '添加一些 AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

### 开发指南

- 遵循现有的代码风格
- 编写有意义的提交信息
- 为新功能添加测试
- 根据需要更新文档
- 确保所有检查通过后再提交

## 📝 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [JumpServer](https://github.com/jumpserver/jumpserver) - 开源堡垒机
- [Electron](https://www.electronjs.org/) - 跨平台桌面运行时
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Nuxt](https://nuxt.com/) - 直观的 Vue 框架

## 📚 相关资源

- [JumpServer 文档](https://docs.jumpserver.org/)
- [打包指南](https://github.com/jumpserver/apps/blob/master/README_PACK.md)
- [浏览器深度链接协议](https://juejin.cn/post/6844903989155217421)
- [Linux 自定义协议处理](https://medium.com/swlh/custom-protocol-handling-how-to-8ac41ff651eb)

## 📮 支持

- **问题反馈**：[GitHub Issues](https://github.com/jumpserver/clients/issues)
- **讨论**：[GitHub Discussions](https://github.com/jumpserver/clients/discussions)
- **JumpServer 社区**：[JumpServer Community](https://github.com/jumpserver/jumpserver)

---

<div align="center">

由 JumpServer 团队用 ❤️ 制作

[⭐ 在 GitHub 上给我们点星](https://github.com/jumpserver/clients) | [📖 文档](https://docs.jumpserver.org/) | [🐛 报告问题](https://github.com/jumpserver/clients/issues)

</div>

### Harness 分支 AI 联调

本分支要求 Kael bootstrap 返回 `agent_engine: codex` 和 `agent_protocol_version: 1`，不兼容旧 Agent 后端。Kael 安装固定版本 `@openai/codex@0.153.2`，Core 的模型地址须支持 Responses API。

Luna 继续通过 `/kael/api/v1` 注册上下文和工具，经现有 Koko/Chen/本地执行器执行工具，并处理审批、流式结果和取消；浏览器和 Electron 均不直接启动 Codex。`model.completed` 的 `scope: agent_turn` 表示完整任务执行耗时，不能当作单次模型思考时间。启动与能力边界见相邻 Kael 仓库的 `docs/adr/0007-codex-harness.md`。
