# Chen V5.1.1 → Go V1 UI / 交互审计

审计基线：Luna `v5.1.1` (`6f0ffe53`)；实现基线：2026-11-03 获取的 `origin/dev` (`56e9e544`)。另读 Chen Java V5.1.1 的树动作 / 元数据实现及 Go `chen-630` (`eeb23bb`) 的 catalog、inspect、browse、edit 协议。以下结论依据处理函数、事件、状态流与 API，不能用组件是否存在代替行为等价。

分类：①完整保留；②入口/交互退化；③缺失；④新版改进；⑤API/协议/权限边界；⑥安全行为，应保持。文件路径以 `ui/chen/` 为前缀；Go 文件以 `internal/` 为前缀。

## 功能对照

| V5.1.1 实际功能 / 处理路径                                | dev 实现位置与差异                                                      | 分类 | 采用 / 修复状态                                                        | 剩余边界                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 树 12px 缩进、全局行高、主题目录图标 (`ResourceTreeNode`) | `v1/GoCatalogTree` 原先 16px 缩进、32px 行、常驻菜单                    | ②    | 恢复旧密度、图标及 hover/focus 菜单                                    | 继续用 Nuxt UI / 现有主题                                                                           |
| 单击非叶节点展开，箭头单独展开                            | 原先单击仅选择                                                          | ②    | 恢复单击选择/展开；双击的第二次 click 不重复切换                       | 目录行为只触发 catalog，绝不执行 SQL                                                                |
| 双击库 / Schema → `openDatabaseWorkspace`                 | 原先只 toggle；规格与表对象默认 data 实现矛盾                           | ②    | 库 / Schema 打开概览；表 / 视图打开数据；列打开结构                    | 明确数据激活是用户动作，箭头无查询                                                                  |
| 表 / 视图 `view_data` 直接打开数据                        | `openObject → objectSection → enterObjectData` 自动建立独立数据 console | ①⑥   | 保留 dev 的显式入口一步直达、对象页复用                                | 不借用活动查询连接                                                                                  |
| 最近访问表、清空 (`useChenRecentTables`)                  | 原先未接入 Go                                                           | ③    | 恢复当前会话最近 10 个对象，去重、双击访问、清空                       | 内存保存；不持久化授权元数据、不跨身份复用                                                          |
| 树设置：表页签名 / SQL 关键字大小写                       | 原先 Go 不消费 `useChenWorkspacePreferences`                            | ③    | 复用旧偏好与存储 key；应用表页签与关键字补全                           | 不改标识符、字面量或已经输入的 SQL                                                                  |
| 树刷新 / 各级右键                                         | `menu`、`refresh`、`load` 已有；复制 / 插入 / SELECT / DDL / 关系图     | ①④   | 保留；最近访问区域也提供清空                                           | Go 不存在通用动态 tree-action / dialog 协议                                                         |
| 树查找旧版只过滤已加载对象                                | `catalogObjects(q,cursor)` 服务端查找、取消过期请求、加载更多           | ④    | 保留 dev                                                               | 搜索范围为认证数据库，不能枚举范围外数据库                                                          |
| 新建查询 / 页签切换 / 关闭 / 重命名                       | `newQuery`、`selectTab`、`tabMenu`、`closeTab`                          | ①④   | 保留独立 Monaco model、console、关闭保护、复制和批量关闭               | 每页真实独立连接                                                                                    |
| 旧 Console 模式：Enter 执行、↑↓历史、交互时间线、清空     | Go Query 可执行 / 历史恢复 / 取消 / 复核，缺少 prompt 时间线模式        | ③    | 保留 Query；记录未等价，不放空 Console 按钮                            | 并非 API 缺口；完整时间线 UI 需要独立有界历史设计，本轮不重写 Console                               |
| SQL 顶栏：运行 / 计划 / 格式化 / SQL / AI / 上下文        | `GoQueryPane` 原先多按钮平铺、wrap                                      | ②    | 恢复紧凑单行，运行全部放相邻下拉；收藏/保存/文件放 SQL；AI 合并        | 窄窗口横向滚动，保留运行范围标签与快捷键                                                            |
| 编辑 / 补全 / 格式化 / 选区执行                           | `MonacoSqlEditor` + `analysis` + `executionRange`                       | ①④⑥  | 保留 Monaco 与服务端分句                                               | 解析失败不退回全文；不在浏览树时执行                                                                |
| SQL 文件旧版上传后执行                                    | `loadSqlFile → uploadSql → restoreQuery` 仅开草稿                       | ④⑥   | 保留新页，不执行；补 `.sql` 后缀验证、异步身份检查                     | 1 MiB、fatal UTF-8、非空 / NUL 校验、upload 权限                                                    |
| 保存 / 收藏 / 删除 SQL 片段                               | `useChenSqlSnippets` + Core adhoc API                                   | ①⑥   | SQL 下拉恢复入口                                                       | Core 登录、组织、方言映射、copy/paste 独立控制；single 无 Core 时说明原因                           |
| SQL 历史                                                  | Go 每页内存 50 条、结果状态快照、新页恢复                               | ④    | 保留紧邻上下文的历史图标                                               | 不自动落盘、不覆盖草稿                                                                              |
| SQL AI 生成 / 解释 / 修复 / 应用                          | `sqlAi` / Surface `requestSqlAi` / context snapshot                     | ①⑥   | 保留 AI 下拉及上下文时效校验                                           | 依赖 Core AI；single 没有可用入口                                                                   |
| 上下文切换                                                | 旧版替换同一连接；Go 每查询固定上下文                                   | ⑥    | 保留新连接模型，通过“以此上下文新建查询”承接                           | 事务、临时表、会话变量不迁移                                                                        |
| 运行 / 取消 / 错误 / 状态恢复                             | `submit/recoverSubmission/acceptEvent` + SSE                            | ①④⑥  | 保留 request_id、告警/复核、未知结果恢复                               | cancel 不是 rollback；取消按协议可能断开连接                                                        |
| 查询结果多语句 / 多结果集切换                             | `result_ids`、`statement_results`、`loadRows`                           | ①    | 保留结果编号与 SQL 来源                                                | 不改变结果审计及分页请求                                                                            |
| 固定结果                                                  | 旧 `toggle_pinned` 保留查询结果                                         | ③    | 恢复有界、只读、内存结果快照                                           | 仅当前已加载行；无重跑/写入/伪全量导出                                                              |
| 单元格 / 区域复制、复制 INSERT / UPDATE                   | `GoResultGrid` / `copySQL` API                                          | ①④⑥  | 保留 dev                                                               | SQL 复制依赖可信来源、列权限与审计，不客户端猜主键                                                  |
| 列宽 / 固定 / 显隐 / 显示偏好                             | `GoResultGrid` + `useChenGridPreferences`                               | ①④   | 保留 dev                                                               | 不替换 AG Grid                                                                                      |
| 大字段、JSON、NULL、空串、二进制                          | `GoResultValue` / `MonacoValueViewer` / `resultGrid`                    | ④    | 保留 dev                                                               | JSON 数字 token 保真、有界格式化与分段查看                                                          |
| 新增 / 改值 / 批量更新 / 删除 / 撤销                      | `GoWritePanel` / `dataEditing`                                          | ①④⑥  | 保留 dev                                                               | 服务端 editability、opaque row reference；视图/ClickHouse 只读；无主键/不可写列拒绝                 |
| 保存前 SQL 预览 / 二次确认                                | `previewEdits → applyEdits(plan_id)`                                    | ①⑥   | 保留不可变计划和提交状态                                               | staged 不自动提交；unknown 不自动重试；500 项 / 2 MiB                                               |
| CSV 导入 / 导出                                           | `GoWritePanel` / `GoExportPanel` / `exportDownload`                     | ①④⑥  | 保留 dev                                                               | 导入 10 MiB 暂存；导出 cached 与 query 重跑明确区分，ticket 一次性                                  |
| WHERE 直接输入 / builder / 排序                           | `GoBrowsePanel` 原先先展开再切 raw                                      | ②    | 恢复直接可见 WHERE、Enter 应用；builder 保留嵌套条件                   | 只对 browse supported 的表启用服务端筛选；AG Grid 查找仅已加载行                                    |
| 首页 / 上一页 / 下一页 / 末页                             | browse / query-page 原先只前后页；cache 也只有前后                      | ②    | 恢复首页；可信计数可算且未超 max_offset 时开放末页；cache 仅已缓存范围 | 不自动 count、不把未知总数当末页；计数字符串保留大整数精度                                          |
| 表基本信息                                                | object 页原先只有路径标题，details 默认主键                             | ②    | 恢复详情基本信息 / 对象注释入口                                        | 不编造精确行数、引擎、创建时间等 inspect 未返回字段                                                 |
| 字段 / 主键 / 外键 / 索引 / 默认值 / DDL                  | `GoObjectPane` columns + `GoObjectDetails` inspect / ddl                | ①②⑤  | 常用属性直接导航，按 supported / restricted / truncated 展示           | Go inspect 只有 primary_key/foreign_keys/indexes/defaults/ddl；缺 check/unique 约束及触发器完整模型 |
| 建表 / 改字段 / 索引 / SQL 预览                           | `GoSchemaEditor` / `schemaSql` / `applySchemaSql`                       | ①⑥   | 保留现有确认及关闭保护                                                 | MySQL 完整列变更走原生 DDL；DDL 隐式提交明确提示；按方言支持                                        |
| 数据库 / Schema 概览、表 / 视图 / 索引 / 统计 / 关系图    | `GoOverviewPane`、`overview`、`GoCatalogDiagram`                        | ①④⑤  | 保留 dev，双击库/Schema 直达                                           | 库节点非跨库入口；统计 estimate/unknown/restricted 分开；PG 表 DDL 是 columns 重建摘要              |
| 日志控制台打开 / 关闭 / 清空 / 未读                       | 原先 Go 仅单页当前错误                                                  | ③    | 复用 `LogConsolePanel`，接执行状态 / 错误 / 审计与断线，200 条内存上限 | 客户端执行消息，不冒充服务端原始日志；不把 SQL 自动落盘                                             |
| 断线 / 重连 / 未保存关闭保护                              | `connectQuery/reconnect/closeWarnings` / schema guard                   | ①④⑥  | 保留 dev                                                               | 不自动重放 SQL，不暗示事务已回滚                                                                    |
| copy/paste/upload/download / 审计                         | transport / session permissions / API                                   | ①⑥   | 复用全部安全检查                                                       | 元数据导航不依赖 can_paste；不能以恢复旧入口绕过 ACL                                                |
| 拖拽 / 主题 / 快捷键 / Web 与 Electron                    | `usePaneResize` / Monaco / 现有 CSS tokens / File API                   | ①④   | 复用，降低常驻工具栏占用                                               | 真实 Electron 与多协议 DB 需分别验证                                                                |

## 尚未全等价的旧入口

- **结果集单独关闭**：V5.1.1 `QueryResultTabs.close` 可关单个结果；当前 dev 原执行结果按 result_ids 切换，只有新加固定快照可单独关闭。没有新增假释放 API；Go 未提供单结果释放端点，本轮未实现纯 UI 隐藏结果。
- **数据库概览中的 Schema 列表**：旧 DatabaseOverviewPanel 的 schemas 子页尚未迁入 GoOverviewPane；Schema 仍可通过服务端分页树 / 上下文选择器访问。catalogSchemas 已有服务端能力，差异属于 UI，不是 API 缺口。
- **表属性的估计行数、索引 method/表达式/排序/包含列**：旧 derived metadata 会展示；Go inspect 的对象级返回较窄，部分信息在 Schema 概览 API 中。表基本信息本轮只恢复实际对象路径、类型和注释，未把缺失信息填成 0 或空表。
- **旧 Console 时间线**、通用约束、完整原生 DDL、可信事务状态的限制见后文。不能把这些剩余差异归为“所有旧功能已恢复”。

## 树与执行语义（实施后）

- 单击：选择；可展开节点展开/收起，只取元数据。箭头点击只切换该分支；双击箭头不进入数据。
- 双击或 Enter：数据库 / Schema 打开已有或新概览；表 / 视图直接打开数据；列打开所属表结构。目录 Enter 展开。
- 右键 / Shift+F10：选择并打开菜单，不切换查询上下文，不执行 SQL。查看数据一步直达；结构 / DDL / 关系图走元数据路径。
- 生成 SELECT 新建 SQL 草稿，绝不执行。SQL 文件导入新建独立草稿，原编辑页、选区及未保存 SQL 保持。
- 最近访问按 session 隔离，只记录对象数据激活；刷新/展开不记录。所有访问仍走授权 API。

## 后端能力证据与剩余差异

- Go `sqlservice/inspect.go` 明确只循环 `primary_key`, `foreign_keys`, `indexes`, `defaults`；DDL 单独 `TableDefinition`；通用 check/unique 约束、触发器和旧 tree action 对话框没有等价 API。没有为它们补假按钮。
- Go `engine/catalog*.go` 使用独立 catalog 连接；不能拿 SQL console 枚举其他数据库。`browse` / `query-page` 的 offset、count、max_offset 和 source_result_id 由服务端控制。
- Console prompt 时间线属于前端缺失，不归为 API 不支持；Query 已覆盖执行/取消/计划/历史/复核，但不宣称 Console 全等价。
- 原始数据库 / 服务器日志、可信事务状态、commit/rollback 专用 UI、错误行列定位尚无完整协议支持；保留 unknown 提示和已有 SQL 执行入口，不伪造状态。
- PG 表 DDL 标记 `reconstructed_columns`，不会被当作完整 native DDL；授权不全时禁止 DDL。各协议能力以 API 字段为准。

## 验证与人工回归

执行环境：Node `24.18.0`、pnpm `11.28.5`，锁文件安装；独立真实 node_modules / .nuxt。浏览器 fixture 与真实数据库/Electron 验证分别记录，不以编译通过代替端到端验收。

| 检查                               | 结果                     | 范围 / 限制                                                                                                                                                                      |
| ---------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go V1 Vitest（Node）               | 14 个文件 / 141 项通过   | 新增精确末页计算与关键字大小写保护；原连接恢复、执行范围、编辑、复核等测试保留                                                                                                   |
| Chromium 组件回归                  | 9 项通过                 | 真实 Vue / Monaco 消费者；Go/Core 传输与 Nuxt UI primitives 使用 fixture；覆盖树、工具栏、导入、上下文、分页保护、固定快照、属性、独立 console、日志及关闭保护                   |
| 构建页面交互                       | 通过                     | 真实 Nuxt UI / AG Grid 与生产构建，接口 fixture；1440/1024/740/390px，工具栏 38px 单行、树行 26px；导入 2 页/2 console/0 execute；单击表 0 数据请求，双击 1 browse；无 pageerror |
| ESLint / Oxlint / 格式与 diff 检查 | 通过                     | 变更 Vue / TS 文件；设计机械扫描无发现                                                                                                                                           |
| Web TypeScript                     | 通过（提高 Node 堆上限） | 默认堆检查曾 OOM；使用 12288 MiB 上限通过，不修改仓库配置                                                                                                                        |
| Electron TypeScript                | 通过                     | 静态兼容性；不等于真实客户端运行                                                                                                                                                 |
| Electron 导出传输回归              | 3 项通过                 | 固定路由票据、流式写入、中断保留原文件                                                                                                                                           |
| Chen 静态构建                      | 通过                     | `pnpm run generate:chen`；没有发布或部署                                                                                                                                         |
| 真实数据库 / Go 服务端集成         | 未运行                   | 未连接真实 PG/MySQL/其他数据库；本轮没有改后端                                                                                                                                   |
| 打包 Electron / 原生端交互         | 未运行                   | 无真实应用启动与系统级导入/导出验收                                                                                                                                              |

以下清单仍应在真实授权数据库和目标运行端人工回归：

1. PG / MySQL 分别单击、双击、点箭头和右键数据库、Schema、表、视图、列；展开无执行请求；明确数据动作一次进入。
2. 搜索首批之外对象、加载更多、快速改搜索、目录失败重试、离线目录；最近访问去重、清空、重新认证隔离。
3. 检查宽/窄窗口工具栏不换行，运行选区/当前/全部、格式化、计划、收藏、AI、历史均可找到。
4. 导入普通/大/空/错误 UTF-8/非 SQL 文件；合法文件只开新页；无任何 executions 请求；旧草稿不变。
5. 切 Schema 新建查询，两个查询 SQL/console/结果相互独立；禁 upload/copy/paste/download 时各入口正确。
6. WHERE Enter 应用、builder、清除、排序、首页/前后/末页；区分缓存筛选；dirty 数据时全部查询翻页动作禁用。
7. 多结果集、固定快照、重新执行、固定结果关闭；固定后不重跑、不写回；检查大字段、NULL/空串/二进制。
8. 暂存增删改、批量操作、预览确认、撤销、关闭保护、未知提交恢复、取消与复核；不自动提交/重试。
9. 表属性、列/主键/外键/索引/默认值/DDL、关系图、建表/改字段/索引 SQL 预览与关闭保护。
10. 日志未读、开关、清空；断线及错误记录；亮暗主题、分割拖拽、键盘焦点；真实 Web / Electron 分别检查。

## PR 提交准备补验

- 按用户提交规则，回归测试文件仅保留在本地，不加入提交；审计与交互文档属于本次明确要求的交付。
- 已使用未修改的原有 Go V1 测试核对纯业务代码版本：14 个文件、139 项通过。
- 补齐全部 10 个语言文件的新增提示后，全量 Web 测试 1447 项通过、104 项跳过；Electron 测试 197 项通过、1 项跳过；ssh-helper Go 测试通过。
- 全量 Oxlint / ESLint 通过；预提交检查发现的声明顺序问题已修正。
- 业务补丁对最新目标 dev `21e1e551` 的应用检查通过，无内容冲突；未改动该提交的客户端锁定模块。
