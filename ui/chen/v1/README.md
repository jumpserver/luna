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

The full Luna database workbench uses Go by default for all supported SQL protocols.
Set `NUXT_PUBLIC_CHEN_GO_V1_PROTOCOLS=mysql,postgresql` to limit a deployment, or set it explicitly
to an empty string to retain the existing Java workspace. This decision is made before exchanging
the one-use Core connection token, and an authentication failure never causes fallback to another backend.
The workspace recognizes `mysql`, `mariadb`, `postgresql`, `oracle`, `sqlserver`, `db2`, `dameng`,
`clickhouse`, `oceanbase-mysql`, and `oceanbase-oracle`. PostgreSQL aliases `postgres` and `pgsql`
map to `postgresql`; `mssql` maps to `sqlserver`, `dm` to `dameng`, and the historical `oceanbase`
protocol to its MySQL mode. Enable only protocols served by the deployed Go backend. OceanBase's
Oracle mode is explicit and does not fall back to its MySQL mode. Unconfigured or unknown protocols
retain the existing workspace.

## Additional dialect presentation and validation boundaries

`ui/chen/utils/sqlDialect.ts` centralizes display names, identifier quoting, editor tokenization,
initial SELECT statements, namespace hierarchy, and preview syntax. MySQL, MariaDB, ClickHouse, and OceanBase
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

The extended-dialect command scanner preserves lexical statement spans and rejects incomplete
quotes/comments and unbalanced parentheses. It is not a complete vendor grammar or proof that
functions have no side effects. Server validation and database permissions remain necessary.
The analysis response's `may_write` flag requests an explicit, frozen SQL confirmation before
ordinary mutations or transaction statements. It is advisory and never replaces server ACL checks.

The optional session capability `can_cancel: false` disables the cancel control and its action
handler with an explanation. An older server that omits the field retains the existing behavior.
For an unsupported driver, closing an active query is blocked with a wait-for-completion message
instead of promising cancellation. The backend currently advertises this limitation for Db2;
the frontend uses the capability rather than a database-name heuristic. Pending command-review tickets
remain cancelable because they have not started database execution.

## Managed connection boundary

Route `/chen/api/v1/` to the Go service while retaining the legacy `/chen/` routes.
Development uses `JMS_CHEN_GO_DEV_URL` for the Go HTTP/SSE API and `JMS_CHEN_DEV_URL` for legacy
Chen; the Go target defaults to the legacy target when no override is configured.
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
Command-review policy failures (`command_review_required`) show an explicit **Request review** action.
Only that action sets `submit_review: true`, with a fresh request ID and the failed execution's immutable
SQL/version snapshot. A lost response retains this exact request for idempotent recovery. The resulting
`waiting_review` execution remains active and can be canceled through the existing cancel endpoint.
Its `review` metadata displays pending, approved, rejected, canceled, timed_out or failed, reviewers and
a safe HTTP(S) ticket link. The UI never approves a ticket. After approval, the backend executes the
original submitted SQL; later editor changes do not alter it. Existing SSE events and HTTP snapshots
carry all state changes, without an additional WebSocket.

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
pnpm exec vitest run --config vitest.config.ts --browser.enabled=false ui/chen/v1/v1.test.ts ui/chen/v1/standalone.test.ts ui/chen/api/client.test.ts
node scripts/chen-v1-editor-smoke.mjs
node scripts/chen-v1-controls-smoke.mjs
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

The isolated Monaco Chromium fixture exercises table, column, alias, JOIN and quoted-name suggestions,
current-statement execution, disabled online actions, clipboard restrictions, Unicode value chunks,
exact JSON tokens, binary display, Find and model disposal. Its API replies are synthetic; it does not
prove database completion semantics or a live Core connection. `chen-v1-controls-smoke.mjs` starts
Nuxt on localhost port 3021 and a synthetic HTTP/SSE server. It checks explicit command review, immutable
SQL/version snapshots, recovery using the same request ID, review cancellation/rejection/approval,
unsupported database cancellation, pause/unlock and administrator close. Reports go to
`output/chen-v1-controls/`. Run these scripts with the supported Node LTS runtime and keep the controls
fixture separate from a concurrent Nuxt build. Go integration tests and
real Core/database acceptance remain separate validation steps. The production build validates
the same-origin worker and Web/Electron assets; desktop main-process end-to-end acceptance is still required.

NotifyWarning policy failures (`command_warning_confirmation_required`) require a separate confirmation
of the failed execution's immutable SQL. Canceling the dialog sends nothing. Explicit confirmation uses
`confirm_warnings: true` with a new stable request ID; a subsequent request for administrator review
retains that consent. Ordinary warning-only notifications do not show this confirmation.

Exports use bounded server-side jobs. The default is all cached rows (with an explicit count and truncation
warning). Full export requires confirmation of the result's frozen SQL, executes one read-only SELECT on
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

`CHEN_UI_URL=http://127.0.0.1:3000/luna/chen/?selector=export-fixture node scripts/chen-v1-export-smoke.mjs`
uses an already running Nuxt dev server, isolated synthetic API routes, and a real Chromium native download.
It checks cached counts/truncation, a large Unicode/BIGINT CSV body, full-query warning/review binding, and
cancelled-task download gating. It does not validate database execution or XLSX encoding; those require the
Go integration suite and live service acceptance. Electron stream tests are in `electron/tests/chen-export.test.ts`.

## Staged writes

`GoWritePanel` only enables changes described by `/consoles/{id}/results/{id}/edit`.
Ordinary results support safe updates; `/browse` adds trusted table insertion/deletion.
Row identities are opaque, scoped server references. The UI stages at most 500 row operations and 2 MiB of encoded save data,
previews them through `/edits/preview`, then applies only the returned plan ID. Review and warning
confirmation retain that plan. Unknown requests keep the same idempotency key for explicit recovery;
unknown commits require database verification and refresh, never an automatic retry.

UTF-8 CSV imports are limited to 10 MiB and the remaining 500-operation budget. CSV uses a separate
insert batch; existing updates/deletes must be saved or discarded first. The 2 MiB encoded-save limit
is checked before preview, with explicit manual batching rather than automatic partial commits. Empty rows are retained;
read-only/generated columns are rejected explicitly. Numbers remain strings, and NULL, empty strings
and omitted INSERT defaults remain distinct. SQL file loading requires `can_upload`, accepts UTF-8
files up to 1 MiB, and opens a new query without running it. Both use browser File APIs on web and Electron.

Schema dialogs generate quoted SQL for user review before the ordinary policy/audit path.
MySQL column-definition changes open native DDL as commented reference in a SQL editor to avoid
silently dropping defaults, identity and comments. The server and database still validate actual DDL.
`dataEditing.test.ts`, `schemaSql.test.ts` and CSV tests cover protocol and data-loss boundaries;
live backend and browser write verification are separate evidence.
