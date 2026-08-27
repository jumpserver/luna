# JumpServer 连接插件

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
└── schema/                     # JSON Schema
```

## 单个插件结构

```
macos.tigervnc/
├── manifest.json    # 元数据（名称、协议、分类、说明）
├── connect.json     # 当前平台启动方式、默认路径、启用状态等
└── icon.png         # 设置页图标（可选）
```

应用发现、选择和启动均由 Electron/Node 直接读取这里的插件配置。SSH helper 使用
Electron 自带的 Node 运行时，不再维护应用启动配置的副本。

## 文档

- [架构设计](../docs/plugins/DESIGN.md)
- [开发指南](../docs/plugins/DEVELOPER.md)
