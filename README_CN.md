# JumpServer Luna

[English](README.md) | 中文

Luna 是 JumpServer 的资产连接工作台，提供 Web 和 Electron 桌面端。终端、文件管理、数据库、远程桌面和 Kubernetes 连接都在同一个工作区中打开，可以通过标签页切换会话。

前端使用 Nuxt 4、Vue 3 和 Nuxt UI。Web 与桌面端共用界面和连接模块，桌面端额外提供本地终端、外部应用调用和离线录像处理等功能。

## 功能

- **终端**：通过 Koko 连接 SSH、Telnet 等资产。
- **文件**：通过 SFTP 浏览、上传、下载和编辑远程文件。
- **数据库**：通过 Chen 浏览数据库对象、编写 SQL 和查看查询结果，支持 MySQL、PostgreSQL、Redis、MongoDB、Oracle、SQL Server、ClickHouse、MariaDB、达梦和 DB2。
- **远程桌面**：通过 Lion 使用 RDP、VNC 和远程应用。
- **Kubernetes**：浏览集群资源并进入容器终端。
- **Web 资产**：通过 Web Proxy 访问 HTTP/HTTPS 应用。
- **会话协作与审计**：会话分享、监控和在线录像回放。
- **AI 助手**：接入 Kael，在工作区中处理终端、数据库等操作，支持工具执行审批和取消。

可用的资产和连接方式由 JumpServer 服务端配置及用户授权决定。界面支持多语言、浅色/深色模式和主题预设。

## 使用

### Web

部署 JumpServer 后，访问站点的 `/luna/` 路径。未登录时会跳转到服务端登录页；登录后选择资产、账号和连接方式即可打开会话。

Luna 需要配合 JumpServer Core 和相应连接组件使用，单独启动前端不包含这些服务。

### 桌面端

从 [Releases](https://github.com/jumpserver/luna/releases) 下载对应平台的安装包：

| 平台    | 安装包                              |
| ------- | ----------------------------------- |
| macOS   | `.dmg`，支持 Apple Silicon 和 Intel |
| Windows | `.exe` 或 `.msi`，支持 x64          |
| Linux   | `.deb` 或 `.rpm`，支持 x64 和 arm64 |

启动后输入 JumpServer 站点地址并登录。桌面端还支持本地 Shell、调用外部终端或数据库客户端、离线录像播放和录像转 MP4。H.264 编码所需的 FFmpeg 插件可在设置中下载。

浏览器可通过 `jms2://` 链接唤起客户端。桌面端 OAuth 回调为 `jms2://auth/callback`，服务端 OAuth 应用需允许该地址；旧版客户端使用的 `jms://` 协议保持独立。

## 本地启动

需要 Node.js 24 和 pnpm 11.4.0。运行桌面端还需 Go 1.25 及以上版本和对应平台的原生编译工具。

```bash
git clone https://github.com/jumpserver/luna.git
cd luna
pnpm install
pnpm web:dev
```

浏览器打开 `http://localhost:3000/luna/`。后端服务需单独启动，开发代理地址可在 `.env.development` 中配置。

启动桌面端：

```bash
pnpm electron:dev
```

## 相关链接

问题反馈请提交到 [Issues](https://github.com/jumpserver/luna/issues)，使用和部署说明见 [JumpServer 文档](https://docs.jumpserver.org/)。

## 许可证

本项目采用 GNU General Public License version 3（GPLv3），与 [JumpServer 主库](https://github.com/jumpserver/jumpserver)保持一致。完整许可条款见 [LICENSE](LICENSE)。

第三方版权声明保留在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
