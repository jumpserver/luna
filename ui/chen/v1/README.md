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

To repeat the production-browser verification, start the opt-in Go `TestSingleBrowserFixture` with
`CHEN_SINGLE_BROWSER_FIXTURE=1 CHEN_BROWSER_DIALECT=mysql` (or `postgresql`) and
`CHEN_BROWSER_FIXTURE_FILE=/tmp/chen-single-browser-fixture.json`. Its private `config_path` and
`state_dir` can be passed to the actual Go CLI:

```sh
# Use the paths emitted by that isolated fixture, not a production database.
data/bin/chen-go single --listen 127.0.0.1:3030 --backends "$fixture_config" \
  --state-dir "$fixture_state" --web-dir ../luna/.output/public

# Luna, in a second terminal
CHEN_SINGLE_BASE_URL=http://127.0.0.1:3030 node scripts/chen-single-browser-smoke.mjs
```

This check opens the real generated route through the real CLI, without temporary pages or a Nuxt
development server. It checks mode discovery, two independent tabs, live completion, precise results,
cancellation and close, and asserts zero Core/Wisp requests and zero WebSockets. Reports and screenshots
are written to `output/chen-single-browser/mysql/` or `output/chen-single-browser/postgresql/`.

## Managed mode

Enable selected protocols at build time with `NUXT_PUBLIC_CHEN_GO_V1_PROTOCOLS=mysql,postgresql`.
The default empty value retains the existing Java workspace. This decision is made before exchanging
the one-use Core connection token, and an authentication failure never causes fallback to another backend.
The workspace recognizes `mysql`, `mariadb`, `postgresql`, `oracle`, `sqlserver`, `db2`, `dameng`,
`clickhouse`, `oceanbase-mysql`, and `oceanbase-oracle`. PostgreSQL aliases `postgres` and `pgsql`
map to `postgresql`; `mssql` maps to `sqlserver`, `dm` to `dameng`, and the historical `oceanbase`
protocol to its MySQL mode. Enable only protocols served by the deployed Go backend. OceanBase's
Oracle mode is explicit and does not fall back to its MySQL mode. Unconfigured or unknown protocols
retain the existing workspace.

## Additional dialect presentation and validation boundaries

`ui/chen/utils/sqlDialect.ts` centralizes display names, identifier quoting, editor tokenization,
initial SELECTs, namespace hierarchy, and preview syntax. MySQL, MariaDB, ClickHouse, and OceanBase
MySQL mode use a database-to-objects hierarchy; PostgreSQL, Oracle, SQL Server, Db2, Dameng, and
OceanBase Oracle mode include a schema level. Missing schemas are not replaced with a database
name in schema-qualified SQL.

Explicit previews generate at most 200 rows using `TOP (200)` for SQL Server, `FETCH FIRST 200 ROWS
ONLY` for Db2, `WHERE ROWNUM <= 200` for Oracle/OceanBase Oracle mode, and `LIMIT 200` for the other
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
an API number. The existing bounded previews, paged read-only viewer, JSON token preservation,
copy permissions, and null/empty distinctions apply to every dialect.

`v1/dialects.test.ts`, `completion.test.ts`, and `resultGrid.test.ts` cover generated SQL, quoting,
namespace contracts, SQL Server completion filtering, LOB types, and nested numeric strings. Go
`internal/sqlservice/dialects_test.go` covers catalog-fixture completion, folding, JOIN/CTE scope,
quoted identifiers, and lexical read-query boundaries. These are unit/contract checks, **not live
compatibility evidence for the additional database servers**. MySQL/PostgreSQL browser fixtures
described above remain separate; each additional engine still requires a running server, matching
driver and permissions, and retained end-to-end evidence for connection, catalog, completion,
query results, cancellation, large values, and audit.

The extended-dialect SELECT scanner preserves lexical statement spans and rejects supported
write patterns, incomplete quotes/comments, and unbalanced parentheses. It is not a complete
vendor grammar or proof that functions have no side effects. Server validation and database
permissions remain necessary. This frontend expansion adds no editing, commit, rollback, or
data-write UI.

The optional session capability `can_cancel: false` disables the cancel control and its action
handler with an explanation. An older server that omits the field retains the existing behavior.
For an unsupported driver, closing an active query is blocked with a wait-for-completion message
instead of promising cancellation. The backend currently advertises this limitation for Db2;
the frontend uses the capability rather than a database-name heuristic.

## Managed connection boundary

Route `/chen/api/v1/` to the Go service while retaining the legacy `/chen/` routes. `JMS_CHEN_DEV_URL`
can point to Go for a V1-only local development session. A mixed local development environment needs
the same path-based gateway used in deployment. All endpoint building uses the existing `chenPath`
helper, so the web site prefix, selected endpoint, Electron credential session and streaming proxy
remain in force. An Electron connection still needs the normal endpoint authorization setup.

The V1 workspace provides one dedicated SQL connection, explicit database/schema context selection,
authorized relation browsing, SQL execution, paged results, cancellation, metadata-aware completion,
local audit persistence status and connection close. Applying a new context opens a new dedicated connection
and closes the previous one; temporary tables and connection-local state belong to that connection.
The initial scope does not expose the legacy table editor, plans, AI, export or multi-console features.

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
pnpm exec vitest run --config vitest.config.ts --browser.enabled=false ui/chen/v1/v1.test.ts ui/chen/v1/standalone.test.ts ui/chen/api/client.test.ts
node scripts/chen-v1-editor-smoke.mjs
pnpm typecheck
pnpm exec nuxt build
```

For the full real-workspace browser check, first run the Go engine's opt-in `TestBrowserFixture`
to create an isolated database and fake Core/Wisp boundaries (`CHEN_BROWSER_DIALECT=mysql` or
`CHEN_BROWSER_DIALECT=postgresql`), then run
`CHEN_BROWSER_FIXTURE_FILE=/tmp/chen-go-browser-fixture.json node scripts/chen-v1-workspace-smoke.mjs`.
It starts Nuxt on port 3019, uses the actual workspace and Go HTTP APIs, and removes its temporary
test route on exit. Results and a synthetic-data screenshot are written under
`output/chen-v1-browser/mysql/` or `output/chen-v1-browser/postgresql/`.

The standalone Chromium smoke uses an explicit completion fixture to verify the actual Monaco Vue
component, suggestion insertion, keyboard execution, clipboard restrictions and model disposal. It
does not prove database completion semantics or a live Core connection. Go integration tests and
real Core/database acceptance remain separate validation steps. The production build validates
the same-origin worker and Web/Electron assets; desktop main-process end-to-end acceptance is still required.
