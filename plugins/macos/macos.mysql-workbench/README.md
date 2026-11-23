# MySQL Workbench（macOS）

在 macOS「隐私与安全性 → 辅助功能」中允许 JumpServer，然后在客户端的数据库插件设置里启用 MySQL Workbench 并确认应用路径。若 Workbench 已经在运行且无法代填，退出 Workbench 后从 JumpServer 重新连接。

支持 MySQL 和 MariaDB。Workbench 会保留连接条目，插件通过连接提示框填写密码。Workbench 8.0 连接 MySQL 8.4 时，登录后若出现版本兼容性提示，可点击「Continue Anyway」进入 SQL 编辑器。

| 实测版本 | 代填登录结果 |
| --- | --- |
| 26.10.0 | MySQL 登录成功 |
| Community 8.0.42、8.0.44、8.0.46、8.0.47 | MySQL 8.0.46、8.4.9 登录成功（Apple Silicon，macOS 27.2） |
