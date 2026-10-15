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

## 数据库客户端

新安装默认选择 DBX，DBeaver Community 继续作为可选插件提供。已有用户保存的客户端选择、
禁用状态和可执行文件路径保持不变。使用 DBX 前请先安装桌面端，并在设置中确认其可执行文件路径；
便携版或自定义安装目录需要手动选择路径，Oracle、达梦需在 DBX 中安装对应驱动。

DBX 使用 `dbx://connection/new` 启动，连接参数采用 URL 编码，并设置 `one_time=true`
自动连接、断开后删除连接信息。用户名和密码使用 JumpServer 连接 Token，端点使用 Magnus 代理地址。
Oracle 的 service name 沿用 Token ID，以便 Magnus 路由；协议别名与服务端 DBX applet 保持一致。
MongoDB 沿用现有客户端的 `authSource=admin&loadBalanced=true&retryWrites=false` 代理参数。
浏览器页面仍通过现有的 JumpServer 客户端唤起流程连接，由 Electron 启动本机 DBX。

可对已安装的 DBX 运行原生连接检查（macOS 示例）：

```sh
JMS_TEST_DBX_EXECUTABLE=/Applications/DBX.app/Contents/MacOS/dbx pnpm --dir electron exec node --import tsx --test --test-name-pattern='installed DBX' tests/application-config.test.ts
```

该检查通过完整插件启动链路发送一次性测试连接，使用临时配置和本地 TCP 监听器确认 DBX
确实发起连接，不需要 Magnus。它不验证代理鉴权或真实数据库查询。

## 文档

- [架构设计](../docs/plugins/DESIGN.md)
- [开发指南](../docs/plugins/DEVELOPER.md)
