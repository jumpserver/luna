# JumpServer Client 连接插件

将 `config.json` 中的应用连接配置拆分为独立插件包，便于维护和扩展。

## 目录结构

```
plugins/
├── builtin/                    # 内置插件（26 个，由 config.json 迁移生成）
│   ├── index.json              # 插件索引
│   └── builtin.*/              # 各插件目录
├── demo/
│   └── hello-terminal/         # 第三方开发示例
├── schema/                     # JSON Schema
├── tools/
│   └── split-config.py         # 从 config.json 重新生成 builtin 插件
└── plugins-state.defaults.json # 默认协议选用关系
```

## 单个插件结构

```
builtin.putty/
├── manifest.json    # 元数据（名称、协议、分类、说明）
├── connect.json     # 各平台启动方式
├── defaults.json    # 默认选中状态、路径、is_internal 等
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
