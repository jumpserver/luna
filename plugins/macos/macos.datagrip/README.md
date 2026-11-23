# DataGrip（macOS）

在 macOS「隐私与安全性 → 辅助功能」中允许 JumpServer，然后在客户端的数据库插件设置里启用 DataGrip 并确认应用路径。首次连接时，按 DataGrip 提示安装对应驱动。数据源会保留，密码在会话断开后清除。

支持 MySQL、MariaDB、PostgreSQL、SQL Server、Oracle（含 SYSDBA）、MongoDB、Redis、Db2 和 ClickHouse。

| 实测版本 | 代填登录结果 |
| --- | --- |
| 2023.3.4、2024.3.5.1、2025.3.6.1 | MySQL、PostgreSQL 登录成功 |
