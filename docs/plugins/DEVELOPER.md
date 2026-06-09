# 连接插件开发指南

本文档面向第三方开发者，说明如何为 JumpServer Client 编写、调试和分发连接插件。

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

| 值 | 说明 |
|----|------|
| `bundled` | 使用客户端自带的二进制（`default` 为相对路径） |
| `system` | 系统 PATH 中的命令（`default` 为命令名，如 `putty.exe`） |
| `user_path` | 用户必须在设置中选择可执行文件路径 |

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
        "script": "scripts/launch.macos.applescript"
      }
    }
  }
}
```

脚本约定：

- 通过环境变量 `JMS_CONNECT_JSON` 接收连接上下文（JSON 字符串）
- 退出码 `0` 表示成功，非 `0` 表示失败
- 标准错误输出会显示在客户端日志中

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

1. **查看合并配置**：调用 Tauri `get_config`，确认插件已出现在对应 `category` 数组中
2. **查看 awaken 日志**：`{config_dir}/jumpserver-client/logs/`
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
