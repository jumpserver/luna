# JumpServer Client 连接插件

将 `config.json` 中的应用连接配置拆分为独立插件包，便于维护和扩展。

## 目录结构

```
plugins/
├── windows/                    # Windows 内置插件
│   ├── index.json              # 当前平台插件索引
│   ├── plugins-state.defaults.json
│   └── windows.*/              # 各插件目录
├── macos/                      # macOS 内置插件
├── linux/                      # Linux 内置插件
├── demo/
│   └── hello-terminal/         # 第三方开发示例
├── schema/                     # JSON Schema
├── tools/
│   └── split-config.py         # 从 config.json 重新生成平台插件
```

## 单个插件结构

```
macos.tigervnc/
├── manifest.json    # 元数据（名称、协议、分类、说明）
├── connect.json     # 当前平台启动方式、默认路径、启用状态等
└── icon.png         # 设置页图标（可选）
```

## 重新生成内置插件

修改 `go-client/config.json` 后，可从备份恢复完整配置再执行：

```bash
python3 plugins/tools/split-config.py
```

## 文档

- [架构设计](../docs/plugins/DESIGN.md)
- [开发指南](../docs/plugins/DEVELOPER.md)
