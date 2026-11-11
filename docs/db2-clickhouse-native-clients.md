# DB2 and ClickHouse native clients

Core must offer `db_client` / `db_guide` for these enterprise protocols and route
both to the endpoint's shared Magnus port. The endpoint is the proxy, never the
asset's backend address/port. User/password are the connection token ID/value;
the database is the asset's `db_name`.

## DB2 LUW

Select DBeaver under application settings → DB2 and configure its executable
path. Install the IBM JCC driver through DBeaver's usual driver manager if prompted.
Launch uses `driver=db2` and `prop.securityMechanism=3` (USRIDPWD), explicitly,
because the Magnus DRDA implementation does not implement encrypted-password or
Kerberos security mechanisms. The DB2 backend's usual default port is 50000;
native clients connect to the **Magnus** port instead.

The connection guide's CLI uses a build of **usql with the DB2 driver**:
`db2://<encoded-token>:<encoded-secret>@<endpoint>:<magnus-port>/<database>?secmec=3&ssl=false`.
Credentials/database names must be URI encoded, then the entire URI shell quoted.
It does not catalog persistent IBM CLP aliases or change the local DB2 catalog.

## ClickHouse

Select DBeaver under application settings → ClickHouse and configure its executable.
Magnus supports **Native TCP**, not ClickHouse HTTP/HTTPS. The usual backend port
is 9000, not 8123. Do not use the standard HTTP JDBC driver or DBX's HTTP driver
for a Magnus native endpoint.

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
- This change does not add protocol-level masking, HTTP bridging or new
  authentication mechanisms to Magnus. Existing experimental DRDA/Native limits
  still apply.
- Enterprise licensing/vendor rules remain aligned with Oracle/Dameng.
- Do not alter the driver mapping, authentication or user preferences of MySQL,
  MariaDB, PostgreSQL, Oracle, Dameng, SQL Server, Redis or MongoDB.
- Automated checks cover platform plugin declarations, token/database/endpoint
  launch fields, delimiter rejection, workspace isolation and existing protocols.
- Live read-only QA uses IBM JCC 11.5.8.0 and Housepower Native JDBC 2.5.6 through
  Magnus, plus Go DRDA/Native clients (ClickHouse compression disabled/LZ4/ZSTD).
  This is **not** a claim of Windows/Linux GUI validation.

References:

- [DBeaver command-line parameters](https://dbeaver.com/docs/dbeaver/Command-Line/)
- [DBeaver managed driver XML](https://dbeaver.com/docs/dbeaver/Admin-Manage-Drivers/)
- [Native JDBC driver](https://github.com/housepower/ClickHouse-Native-JDBC)
- [DBX ClickHouse HTTP implementation](https://github.com/t8y2/dbx/blob/main/crates/dbx-drivers/src/db/clickhouse_driver.rs)
