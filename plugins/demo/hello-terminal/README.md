# Hello Terminal — 连接插件 Demo

最小可运行的 JumpServer Client 连接插件示例，用于验证插件目录结构、打包流程和脚本启动约定。

## 文件说明

| 文件 | 作用 |
|------|------|
| `manifest.json` | 插件元数据 |
| `connect.json` | 各平台启动方式 |
| `icon.png` | 设置页图标（128×128） |
| `scripts/` | 平台启动脚本 |

## 本地安装测试

```bash
# 从仓库根目录执行
PLUGIN_DIR="$(pwd)/plugins/demo/hello-terminal"

# macOS
DEST=~/Library/Application\ Support/jumpserver-client/plugins/demo.hello-terminal
mkdir -p "$(dirname "$DEST")" && cp -R "$PLUGIN_DIR" "$DEST"

# Linux
DEST=~/.config/jumpserver-client/plugins/demo.hello-terminal
mkdir -p "$(dirname "$DEST")" && cp -R "$PLUGIN_DIR" "$DEST"
```

重启客户端后，在 **设置 → 应用 → SSH** 中启用「Hello Terminal (Demo)」。

## 打包

```bash
./plugins/tools/pack.sh plugins/demo/hello-terminal
```

输出：`dist/demo.hello-terminal@1.0.0.jscplugin`

## 改造为真实工具

1. 将 `launch.type` 改为 `args`，填写目标客户端命令行模板；或
2. 保留 `script`，在脚本内调用真实可执行文件；或
3. 使用 `url` 类型对接 URL Scheme（如 Navicat）

详细说明见 [开发者指南](../../docs/plugins/DEVELOPER.md)。
