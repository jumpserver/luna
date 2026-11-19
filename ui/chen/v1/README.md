# Chen Go V1 workspace

## Single mode

Generate the ordinary Luna static assets and serve them directly from the Go executable. With Chen
and Luna checked out in adjacent directories:

```sh
# Luna
pnpm install --frozen-lockfile
pnpm generate:chen

# Chen
cd ../chen
mkdir -p data/bin
GOTOOLCHAIN=go1.26.3 go build -o data/bin/chen-go ./cmd/chen-go
cp conf/standalone_backends_example.yaml data/standalone_backends.yml
chmod 600 data/standalone_backends.yml
# Fill in the local database connection details in that private server-side file.
data/bin/chen-go single --backends data/standalone_backends.yml --web-dir ../luna/.output/public
```

Open `http://127.0.0.1:8083/luna/chen/?selector=local-mysql` or another selector configured on the Go service.
The root URL `http://127.0.0.1:8083/?selector=local-mysql` redirects to that same route. Static output
is `.output/public`; `generate:chen` fixes the app base to `/luna/`, including when the general
`NUXT_APP_BASE_URL` environment variable has another value. Node.js and a development proxy are only build
dependencies. Runtime configuration flags and a protocol in the URL are unnecessary.

Only `/chen` and `/chen/` inside the Nuxt router use the independent app shell. The existing managed
app implementation remains intact in `ui/components/ManagedApp.vue`; normal routes retain its auth,
Core language synchronization, workspace features and desktop behavior. The independent shell shares
local theme settings, Nuxt UI and translations without mounting those managed lifecycle components.
The direct route first verifies `/chen/api/v1/capabilities` reports `mode: single`, then creates a session
using only `{selector, request_id}`. The returned session determines the SQL dialect. Database passwords
remain in the Go configuration. Single requests omit ambient cookies and Core headers; session tokens
remain in the workspace closure. Separate tabs use separate request IDs and independent sessions;
retrying one creation attempt retains its request ID in memory. Managed and single authentication do
not fall back to one another.

## Managed mode

The full Luna database workbench uses the Go backend for all supported SQL protocols.
The retired Java workspace and its protocol-selection override have been removed.
An authentication failure never causes fallback to another backend or reuses the one-use Core token.
The workspace recognizes `mysql`, `mariadb`, `postgresql`, `oracle`, `sqlserver`, `db2`, `dameng`,
`clickhouse`, `oceanbase-mysql`, and `oceanbase-oracle`. PostgreSQL aliases `postgres` and `pgsql`
map to `postgresql`; `mssql` maps to `sqlserver`, `dm` to `dameng`, and the historical `oceanbase`
protocol to its MySQL mode. OceanBase's Oracle mode is explicit and does not fall back to its
MySQL mode. Available protocols and operations are reported by the Go backend.

## Additional dialect presentation and validation boundaries

`ui/chen/utils/sqlDialect.ts` centralizes display names, identifier quoting, editor tokenization,
initial SELECT statements, namespace hierarchy, and preview syntax. MySQL, MariaDB, ClickHouse, and OceanBase
MySQL mode use a database-to-objects hierarchy; PostgreSQL, Oracle, SQL Server, Db2, Dameng, and
OceanBase Oracle mode include a schema level. Missing schemas are not replaced with a database
name in schema-qualified SQL.

Explicit previews generate at most 50 rows using `TOP (50)` for SQL Server, `FETCH FIRST 50 ROWS
ONLY` for Db2, `WHERE ROWNUM <= 50` for Oracle/OceanBase Oracle mode, and `LIMIT 50` for the other
dialects. Oracle-family consoles start with `SELECT 1 FROM DUAL`; Db2 uses `SYSIBM.SYSDUMMY1`.
Names containing dots, quotes, closing brackets, whitespace, or Unicode remain single quoted identifiers.
SQL Server bracket-delimited completion uses complete-token replacement and preserves doubled `]` escapes.

The installed Monaco tokenizers provide MySQL, PostgreSQL, and generic SQL highlighting. The backend
provides completion semantics through HTTP. Formatting uses the installed sql-formatter dialects;
ClickHouse falls back to generic SQL and Dameng to PL/SQL for presentation. These formatter choices
do not validate execution grammar or grant permission to execute SQL.

The result viewer recognizes CLOB/NCLOB/DBCLOB, NVARCHAR(MAX), RAW/LONG RAW/IMAGE, and ClickHouse
Nullable/LowCardinality/Array/Map/Tuple types. Binary display requires both a binary database type
and the API's `0x` hex encoding; text beginning with `0x` remains text. Nested integers and decimals
must arrive as exact strings from the backend. JavaScript cannot recover precision already lost in
an API number. The existing bounded previews, paged viewer, JSON token preservation,
copy permissions, and null/empty distinctions apply to every dialect.

The extended-dialect command scanner preserves lexical statement spans and rejects incomplete
quotes/comments and unbalanced parentheses. It is not a complete vendor grammar or proof that
functions have no side effects. Server validation and database permissions remain necessary.
Editor SQL retains the legacy confirmation for unrestricted UPDATE/DELETE statements. Ordinary
execution does not wait for a duplicate analysis request. Server ACL, audit, and transaction guards
still apply. The independent console sends `console_mode: true` for its raw statement scanner.

The optional session capability `can_cancel: false` disables the cancel control and its action
handler with an explanation. An older server that omits the field retains the existing behavior.
For an unsupported driver, closing an active query is blocked with a wait-for-completion message
instead of promising cancellation. The backend currently advertises this limitation for Db2;
the frontend uses the capability rather than a database-name heuristic. Pending command-review tickets
remain cancelable because they have not started database execution.

## Managed connection boundary

Route `/chen/api/v1/` to the Go service as HTTP with SSE streaming enabled.
Development uses `JMS_CHEN_DEV_URL`, with `JMS_CHEN_GO_DEV_URL` as an optional override;
both select the Go HTTP/SSE API. The retired `/chen/ws/` proxy is no longer configured.
Use `pnpm web:dev --host 0.0.0.0 --port 3000` for the full browser workspace at `/luna/`; `pnpm dev`
starts Electron as well. Core login, asset permissions, ACL checks and one-use connection tokens remain
on their ordinary Luna paths. The `/luna/chen/?selector=...` route is only the standalone mode. All endpoint building uses the existing `chenPath`
helper, so the web site prefix, selected endpoint, Electron credential session and streaming proxy
remain in force. An Electron connection still needs the normal endpoint authorization setup.

The V1 workspace gives each SQL query tab a dedicated connection and an explicit database/schema
context. It supports authorized object browsing, paged results, cancellation, metadata-aware completion,
local audit persistence status and connection close. A different context opens a separate query tab;
temporary tables and connection-local state remain bound to their original connection. Trusted table
and result editing use server-provided metadata and immutable preview plans. Transaction COMMIT and
ROLLBACK remain explicit SQL operations; saving grid changes never commits an existing transaction. MySQL, MariaDB, PostgreSQL, ClickHouse and
OceanBase MySQL support estimated plans: the server prepares one safe EXPLAIN statement, then the
client submits it on the same console through ordinary execution, warning, review and audit checks.
ANALYZE is never requested. CSV/XLSX export tasks require `can_download`; cached and explicit full-query
modes are described below. Object details expose only
metadata returned by the provider: primary keys, foreign keys, indexes, defaults and source DDL.
DDL is loaded only when its detail page is selected, using a separate endpoint.
Unsupported sections and partial results remain explicit. SQL AI reuses Luna’s existing SQL panel
with connector-owned HTTP messages and the workspace SSE stream; it never needs another WebSocket.
The server manifest controls availability. Proposals must match the connection, context, Monaco revision
and original text and require explicit application. Applying a proposal edits SQL without executing it.

All commands and metadata calls use HTTP. A single fetch-based SSE connection per workspace carries
execution/session events. It supports the token header, `Last-Event-ID` and Electron's streaming proxy.
`console.updated` with `lost` disables execution and offers an explicit new connection. A reset
snapshot restores the active session/console/execution after a retention-window gap. Locked or closed
sessions cannot submit SQL or completion requests.
Reconnection reads the execution snapshot through HTTP; it never repeats SQL. A submission whose
response was lost retains its immutable SQL and request ID; the recovery action uses that same ID
against the server's idempotency contract. Database `unknown` and `cancel_requested` are distinct from
successful cancellation. SQL outcome and local audit persistence are displayed separately. `recorded`
means local audit persistence completed. In managed mode the backend queues Core delivery and retries
it separately; this status does not claim Core delivery. In single mode audit remains local.
Command review pauses the current statement with an immutable `confirmation` ID and SQL snapshot.
The user explicitly submits or cancels it through `/executions/{id}/confirm`; acceptance continues
that execution without replaying successful earlier statements. `waiting_review` remains active
and cancelable. Actual `review` metadata displays pending, approved, rejected, canceled, timed_out
or failed, reviewers, and a safe HTTP(S) ticket link. The UI never approves an administrator ticket.
SSE and HTTP snapshots include an execution revision so older responses cannot revive a prior
confirmation. Older servers' failed-policy responses retain their explicit resubmission fallback.

An administrator pause preserves drafts and results while disabling execution and online completion.
The optional `state_reason` distinguishes an administrator lock from a control-stream outage; the
latter pauses execution until control recovers. Unlocking does not submit SQL. Closing a session marks every console closed and retains in-memory
results/drafts; a late HTTP response cannot restore an active execution after the event stream closes.

Session tokens remain only in memory and are never appended to URLs or persisted in browser storage.
Session creation carries a per-workspace `request_id` nonce; only the same in-memory attempt can
recover that token exchange. A page refresh generates a new nonce and does not restore a consumed
connection token or replay SQL.

Monaco 0.57.0 uses its ESM API, MySQL/PostgreSQL syntax definitions and one locally bundled editor
worker. No CDN, all-language bundle, browser WebSocket or LSP transport is loaded. Completion uses
the active Go console over HTTP, sends UTF-16 offsets and document versions, cancels previous requests,
and rejects stale or invalid replies. Editor models, completion providers and observers are disposed
on unmount. Themes use the existing semantic editor/syntax/workspace tokens. Copy/paste permissions
are applied to editor keyboard, DOM clipboard/drop operations and the result surface.

Checks:

```sh
pnpm lint:check
pnpm typecheck
pnpm exec nuxt build
```

Validate database flows against a dedicated local database and record browser, backend, and
Core-policy validation separately. Static checks and builds do not establish live database compatibility.

NotifyWarning pauses the current statement for a separate SQL confirmation. The dialog binds both
the execution and confirmation IDs; Submit resumes in place, and Cancel stops the execution without
replaying its prefix. Ordinary warning notifications do not request confirmation.

Exports use bounded server-side jobs. The default is all cached rows (with an explicit count and truncation
warning). Full export uses the result's frozen SQL, executes one read-only SELECT on
the same console, and retains its database/schema/temporary-table context. Existing SQL LIMIT clauses are
preserved. Warning/review retries bind the same SQL, document version, export format and explicit consent;
the editor's later changes do not change the export. CSV and XLSX share progress, cancellation and expiry.
The server enforces a 10-minute full-query execution budget and a 2-minute cached-file generation budget
plus row/encoded-byte limits; CSV permits fields longer
than 32,767 characters within those bounds; XLSX's 32,767-character cell limit fails rather than truncates.
Only a completed, audited, sealed file exposes Download. Files can be released explicitly.

The web runtime submits a short-lived, one-use ticket in a native form POST body, never a query string or
file-sized fetch Blob. A started browser download is not presented as a saved file; its native download
list owns completion reporting. Electron selects the destination before obtaining the ticket, validates
the registered connector and fixed download route, streams to a private temporary file, and only renames
it to the selected destination after completion. Interrupted streams remove partial files.

## Staged writes

`GoWritePanel` only enables changes described by `/consoles/{id}/results/{id}/edit`.
Ordinary results support safe updates; `/browse` adds trusted table insertion/deletion.
Row identities are opaque, scoped server references. The UI stages at most 500 row operations and 2 MiB of encoded save data,
previews them through `/edits/preview`, then applies only the returned plan ID. Review and warning
confirmation retain that plan. Unknown requests keep the same idempotency key for explicit recovery;
unknown commits require database verification and refresh, never an automatic retry.

UTF-8 CSV imports are limited to 10 MiB and the remaining 500-operation budget. CSV uses a separate
insert batch; existing updates/deletes must be saved or discarded first. The 2 MiB encoded-save limit
is checked before preview, with explicit manual batching rather than automatic partial commits. Empty rows and mapped non-insertable columns are skipped, matching the previous import flow. Numbers remain strings, and NULL, empty strings
and omitted INSERT defaults remain distinct. SQL file upload requires `can_upload`, accepts nonempty
`.sql` files up to 1 MiB and 1,048,576 decoded UTF-16 code units, and opens a new query draft without executing it.
This file-opening flow is explicitly retained alongside transactions, context menus, and selectable
result loading modes. Text decoding replaces malformed UTF-8, as in Java. The file limit protects the editor model independently of execution transport; files are never split,
truncated, or executed while opening. Ordinary SQL execution retains its separate transport limits.
Both file flows use browser File APIs on web and Electron.

Schema dialogs generate quoted SQL for user review before the ordinary policy/audit path.
MySQL column-definition changes preserve the remaining native column attributes from SHOW CREATE,
including defaults, identity and comments. The original DDL remains available as a SQL reference.
The server and database still validate actual DDL.

Pinned results retain their source and console for refresh, permitted edits, copy, and export.
There is no additional three-result or 2 MiB pin limit. New SQL keeps pinned sources alive;
unpinning releases only otherwise-unused result caches and never closes the shared console.
