# 连接插件开发指南

本文档面向第三方开发者，说明如何为 JumpServer 编写、调试和分发连接插件。

## 快速开始

### 1. 复制 Demo

```bash
cp -r plugins/demo/hello-terminal plugins/my-company-my-tool
```

### 2. 修改 manifest.json

- 将 `id` 改为全局唯一值（推荐反向域名：`com.yourcompany.toolname`）
- 填写 `category`、`protocols`、`comment` 等

### 3. 编写 connect.json

为每个目标平台配置 `executable` 与 `launch` 策略（见 [DESIGN.md](./DESIGN.md)）。

### 4. 准备图标

- `icon.png`，128×128 PNG，透明背景更佳

### 5. 本地测试

**方式 A — 目录安装（开发推荐）**

将插件目录复制到用户配置目录：

```bash
# macOS / Linux
cp -r plugins/demo/hello-terminal \
  ~/Library/Application\ Support/jumpserver-client/plugins/demo.hello-terminal

# Windows (PowerShell)
Copy-Item -Recurse plugins\demo\hello-terminal `
  "$env:APPDATA\jumpserver-client\plugins\demo.hello-terminal"
```

重启客户端，在 **设置 → 应用 → SSH** 中应能看到 "Hello Terminal (Demo)"。

**方式 B — 打包安装**

```bash
./plugins/tools/pack.sh plugins/demo/hello-terminal
# 生成 dist/demo.hello-terminal@1.0.0.jscplugin
# 在客户端「设置 → 插件管理」中选择该文件安装（阶段 2 功能）
```

### 6. 打包分发

将 `.jscplugin` 文件分发给用户，或上架到企业插件仓库。

---

## manifest.json 字段说明

```json
{
  "id": "demo.hello-terminal",
  "name": "hello_terminal",
  "display_name": "Hello Terminal (Demo)",
  "version": "1.0.0",
  "min_client_version": "4.0.0",
  "author": "JumpServer Community",
  "homepage": "https://github.com/jumpserver/clients",
  "download_url": "",
  "category": "terminal",
  "protocols": ["ssh"],
  "builtin": false,
  "comment": {
    "zh": "演示插件：通过脚本启动终端。",
    "en": "Demo plugin: launches terminal via script."
  }
}
```

**注意**：

- `id` 安装后不可修改，升级插件应提高 `version` 并保持 `id` 不变
- `category` 必须与实际用途一致，决定在哪个设置子页面出现
- `protocols` 中的协议必须在 JumpServer 中已支持

---

## connect.json 详解

### 简单参数模式（args）

适用于命令行参数固定的工具，如 PuTTY、DBeaver CLI：

```json
{
  "platforms": {
    "windows": {
      "executable": {
        "type": "user_path",
        "default": "",
        "required": true
      },
      "launch": {
        "type": "args",
        "template": "-ssh {username}@{host} -P {port} -pw {value}"
      }
    }
  }
}
```

`executable.type` 取值：

| 值          | 说明                                                     |
| ----------- | -------------------------------------------------------- |
| `bundled`   | 使用客户端自带的二进制（`default` 为相对路径）           |
| `system`    | 系统 PATH 中的命令（`default` 为命令名，如 `putty.exe`） |
| `user_path` | 用户必须在设置中选择可执行文件路径                       |

### 脚本模式（script）

适用于 iTerm2、需要 AppleScript / PowerShell 自动化的场景。

`connect.json`：

```json
{
  "platforms": {
    "macos": {
      "executable": { "type": "system", "default": "osascript" },
      "launch": {
        "type": "script",
        "script": "scripts/launch.macos.applescript",
        "interpreter": "/usr/bin/osascript"
      }
    }
  }
}
```

脚本约定：

- 通过环境变量 `JMS_CONNECT_JSON` 接收连接上下文（JSON 字符串）
- 启动器等待脚本退出：退出码 `0` 表示交接成功，非 `0` 表示失败；脚本应启动目标程序后退出
- `launch.use_ssh_helper: true` 时，`helper` 是已做 shell 引号转义的 SSH helper 命令；连接参数仍需脚本分别转义
- `launch.protocol_aliases` 可转换上下文中的协议，例如将 `telnet` 映射为 `ssh`
- `command` 非空时是服务端下发的完整命令，终端插件应直接执行，不再添加 helper
- iTerm2 的完整示例见 `plugins/macos/macos.iterm/`；窗口和标签页行为由插件脚本维护
- `launch.interpreter: "node"` 使用 Electron 自带的 Node 运行时，不依赖用户安装 Node.js；入口脚本使用标准 JavaScript（例如 `.mjs`）
- `launch.input: "stdin"` 将 JSON 写入脚本的标准输入并关闭输入流，环境变量中不设置 `JMS_CONNECT_JSON`；默认仍使用环境变量
- `launch.serialize: true` 按脚本路径排队执行，前一次交接成功或失败后才启动下一次
- 上下文还提供已解析的 `executable`、数据库名 `dbname`；连接 URL 由插件自行构造
- Windows Navicat 的完整示例见 `plugins/windows/windows.navicat17/`；版本检查、SQL Server 对话框操作和成功确认均在插件内完成

脚本接收的 JSON 示例：

```json
{
  "name": "web_server",
  "protocol": "ssh",
  "username": "JMS-admin",
  "value": "secret-token",
  "host": "10.0.0.1",
  "port": 22,
  "asset": { "id": "...", "name": "...", "address": "10.0.0.1" }
}
```

### 参数构造模块（module）

复杂参数和配置文件准备放在插件的 JavaScript 模块内。客户端使用 Electron 自带的 Node 子进程调用模块，连接上下文通过 stdin 传递；模块默认导出一个接收上下文的函数，可返回 Promise。

```json
{
  "launch": {
    "type": "module",
    "module": "scripts/launch.mjs"
  }
}
```

```js
export default function (context) {
  return { type: "args", args: ["--host", context.host, "--port", String(context.port)] };
}
```

- `args` 中每项是一个完整参数，不经过 shell 拆分。模块可以先准备私有配置文件，再返回启动参数；RESP、DBeaver 和 DBX 提供完整示例。
- 数据库命令模块声明 `target: "terminal"`，返回 `{ type: "terminal", command }`。客户端会将命令交给设置中所选的终端宿主，而不是插件固定指定的终端。
- 能接收完整命令的宿主脚本或模块声明 `accepts_command: true`，优先使用 `context.command`。自定义 SSH 参数模板在没有明确命令模板时不支持此能力，客户端会报错，避免静默改用其他宿主。
- 上下文包含 `connect_options`，用于 SYSDBA 等连接选项；`helper_executable` 是未做 shell 转义的 helper 路径，适合直接放进参数数组。
- 模块最多运行 30 秒，返回的 JSON 最大为 1 MiB；错误不会回显连接凭据。模块代码须使用标准 JavaScript 和 Node 内置模块，客户端不会为插件安装第三方依赖。
- 各平台插件独立打包，不能从其他插件目录导入运行时文件。

### URL Scheme 模式（url）

适用于 Navicat 等通过自定义协议启动的工具：

```json
{
  "launch": {
    "type": "url",
    "template": "navicat://conn.mysql?Conn.Host={host}&Conn.Port={port}&Conn.Username={username}"
  }
}
```

### 临时文件模式（file）

适用于 RDP：先写入 `.rdp` 文件再打开。

```json
{
  "launch": {
    "type": "file",
    "extension": "rdp",
    "open_with": "system"
  }
}
```

客户端会将服务端下发的 `file.content` 写入临时文件，再按平台打开。

---

## 多协议插件

一个插件可支持多个协议（如 XShell 同时支持 ssh、telnet）。在 `manifest.protocols` 中列出即可。

用户为每个协议独立选择默认工具；同一插件可被选为多个协议的默认项。

---

## 调试技巧

1. **查看合并配置**：调用 Electron `get_config`，确认插件已出现在对应 `category` 数组中
2. **查看启动日志**：查看 JumpServer 的 Electron 日志
3. **脚本调试**：手动执行脚本并注入环境变量：

```bash
export JMS_CONNECT_JSON='{"protocol":"ssh","host":"127.0.0.1","port":22,"username":"test","value":"pass","name":"test"}'
osascript plugins/demo/hello-terminal/scripts/launch.macos.applescript
```

---

## 常见问题

### 插件未出现在设置页？

- 检查 `category` 与页面是否匹配（如 SSH 页面对应 `terminal` + `ssh`）
- 检查 `platforms` 是否包含当前操作系统
- 检查 `plugins-state.json` 中是否 `enabled: false`

### Windows 下路径选择？

`executable.type` 为 `user_path` 时，设置页会显示「选择路径」按钮（与现有第三方工具行为一致）。

### 能否依赖客户端内置二进制？

可以。`executable.type: "bundled"`，`default` 填写相对于客户端 `resources/bin/` 的路径。仅 JumpServer 官方内置插件建议使用此类型。

---

## 版本兼容

- 提高插件 `version` 即可覆盖安装
- `min_client_version` 低于当前客户端版本时拒绝安装
- 新增 `launch.type` 时会在 `min_client_version` 中声明

---

## 提交官方内置插件

若希望插件进入 JumpServer 官方发行版：

1. 在 `plugins/builtin/` 下提交 PR
2. 设置 `manifest.builtin: true`
3. 提供各平台实测记录
4. 图标放入插件目录，**不要**再改 `settingItems.vue` 中的硬编码映射
