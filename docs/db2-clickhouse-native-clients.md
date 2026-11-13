# DB2 and ClickHouse native clients

Core must offer `db_client` / `db_guide` for these enterprise protocols and route
both to the endpoint's shared Magnus port. The endpoint is the proxy, never the
asset's backend address/port. User/password are the connection token ID/value;
the database is the asset's `db_name`.

## DB2 LUW

Select DBX or DBeaver under application settings → DB2 and configure its executable
path. Install the IBM JCC driver through DBeaver's usual driver manager if prompted.
DBeaver launch uses `driver=db2`, `prop.securityMechanism=3` (USRIDPWD), and
`prop.sslConnection=false`, explicitly,
because the Magnus DRDA implementation does not implement encrypted-password or
Kerberos security mechanisms. The DB2 backend's usual default port is 50000;
native clients connect to the **Magnus** port instead.

DBX launch supplies `type=db2`, `ssl=false`, and
`url_params=securityMechanism=3;sslConnection=false;`. These settings describe the
frontend connection, independently of asset backend TLS. JCC 4.33 changed its
default security mechanism to 9; Magnus currently supports mechanism 3. DBX's
JDBC connection pool also calls `Connection.isValid()`: Magnus now forwards the
empty-parameter EXCSAT ping to Db2 and returns the backend's answer. This does
not enable arbitrary manager changes, empty DSS frames or unaudited SQL.

For an existing DBX CLI connection, apply the same SSL and URL parameter settings
to its saved DBX profile. The CLI uses that profile; upgrading the launcher does
not rewrite existing saved connections.

If DBeaver cannot resolve `com.ibm.db2:jcc:RELEASE`, install a fixed JCC version
(e.g. `com.ibm.db2:jcc:11.5.9.0`) or add its JAR in Driver Manager. Maven download
failures occur before any connection reaches Magnus.

The connection guide's CLI uses a build of **usql with the DB2 driver**:
`db2://<encoded-token>:<encoded-secret>@<endpoint>:<magnus-port>/<database>?secmec=3&ssl=false`.
Credentials/database names must be URI encoded, then the entire URI shell quoted.
It does not catalog persistent IBM CLP aliases or change the local DB2 catalog.

## ClickHouse

Select DBeaver under application settings → ClickHouse and configure its executable.
Magnus accepts both Native TCP and HTTP SQL on its shared port. DBX uses HTTP;
DBeaver's bundled Magnus plugin and `clickhouse-client` use Native TCP.

Configure the ClickHouse asset backend port to match its client transport:
**8123** (HTTP) for DBX, **9000** (Native TCP) for the DBeaver plugin or native CLI.
Custom ports and backend HTTPS/native TLS use the asset's explicit port and TLS
settings. No backend port is guessed or silently retried. If both transports are
needed, configure separate asset entries pointing at their respective service
ports. Clients always connect to the **Magnus** host/port.

Enable DBX under application settings → ClickHouse. Explicit saved DBX selections
are preserved; existing DBeaver defaults are retained on upgrade. The launcher
passes `type=clickhouse` and `ssl=false` for the frontend. Backend HTTPS is
configured independently on the asset.

HTTP requests authenticate with the token, substitute the asset account, apply
SQL filtering/approval and audit callbacks before forwarding, and honor database
pinning. UTF-8 SQL is bounded to 16 MiB. SQL in the URL and body is combined before
policy evaluation. Basic authentication, ClickHouse credential headers, and URL
credentials are accepted; identity cannot change on a keep-alive connection.
Only the SQL endpoint is exposed, with a bounded setting allowlist. Persistent
HTTP sessions, external tables, compressed input, and query bindings are rejected.
Mandatory masking rejects execution. Backend POSTs use fresh connections with no
redirects, credential forwarding, automatic fallback or write replay.

The launcher provisions only a driver definition in the client configuration
directory's `dbeaver-clickhouse-native/.metadata/.config/drivers.xml` and supplies
`-data` for this separate workspace. The custom driver ID is
`jumpserver-clickhouse-native`, class `com.github.housepower.jdbc.ClickHouseDriver`,
with the tested `com.github.housepower:clickhouse-native-jdbc-shaded:2.5.6` artifact.
DBeaver downloads it on first use; in an offline environment install that JAR
through Driver Manager in this workspace. No network download occurs in the
launcher itself. Existing workspaces, HTTP drivers and connections are not modified;
an existing managed `drivers.xml` is never overwritten.

The command guide uses `clickhouse-client` (Native TCP); it must be installed locally.
The generated launch plan uses the configured gateway host/port and passes all
DBeaver connection fields as **one argument**, retaining spaces/quotes/Unicode
and rejecting the reserved `|` and NUL delimiters. No connection token is
written to the driver definition. DBeaver connections are temporary (`save=false`).

Platform plugins share `plugins/shared/dbeaver`; Electron resource preparation
copies this directory alongside the platform plugins. Regression tests exercise
the copied bundle as well as concurrent workspace initialization and preservation
of existing driver files.

## Boundaries and regression checks

- Both proxy frontends currently use plaintext. Use a trusted network or a
  separately secured tunnel. Do not configure frontend TLS as if it were
  backend TLS.
- This change does not add result masking or new DB2 authentication mechanisms.
  Existing experimental DRDA/Native limits still apply.
- Enterprise licensing/vendor rules remain aligned with Oracle/Dameng.
- Do not alter the driver mapping, authentication or user preferences of MySQL,
  MariaDB, PostgreSQL, Oracle, Dameng, SQL Server, Redis or MongoDB.
- Automated checks cover platform plugin declarations, token/database/endpoint
  launch fields, delimiter rejection, workspace isolation and existing protocols.
- Live read-only QA uses IBM JCC 11.5.9.0 / 4.33.31 (plain JDBC, DBeaver defaults,
  DBX URL parameters and connection-pool validation), DBX DB2 Agent 0.1.56 RPC,
  ClickHouse HTTP JSONCompact/streaming results, and Housepower Native JDBC 2.5.6,
  plus Go DRDA/Native clients (compression disabled/LZ4/ZSTD). macOS DBeaver
  26.2.4 also established its main and metadata connections and loaded schemas
  and data types. Windows/Linux GUI and the complete DBX CLI workflow are not
  claimed by these checks.

References:

- [DBeaver command-line parameters](https://dbeaver.com/docs/dbeaver/Command-Line/)
- [DBeaver managed driver XML](https://dbeaver.com/docs/dbeaver/Admin-Manage-Drivers/)
- [Native JDBC driver](https://github.com/housepower/ClickHouse-Native-JDBC)
- [DBX ClickHouse HTTP implementation](https://github.com/t8y2/dbx/blob/main/crates/dbx-drivers/src/db/clickhouse_driver.rs)
