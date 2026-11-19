import { prepareDriverWorkspace } from "./native.mjs";

export default async function prepareDBeaverConnection(context) {
  if (context.command) throw new Error("DBeaver does not accept terminal commands");
  // DBeaver can load metadata concurrently with SQL results. Prefer its
  // official HTTP driver when Magnus has a configured HTTP backend route.
  const clickHouseNative = context.protocol === "clickhouse" && context.connect_options?.clickhouse_http !== true;
  const oceanBaseOracle = context.protocol === "mysql" && context.connect_options?.oceanbase_tenant_mode === "oracle";
  const workspaceDriver = clickHouseNative ? "clickhouse-native" : oceanBaseOracle ? "oceanbase-oracle" : null;
  const fields = {
    name: context.name,
    driver: context.protocol === "sqlserver" ? "mssql_jdbc_ms_new" : context.protocol,
    user: context.username,
    password: context.value,
    ...(context.protocol === "dameng" ? {} : { database: context.dbname }),
    host: context.host,
    port: context.port,
    save: "false",
    connect: "true"
  };
  // DBeaver's OceanBase provider appends @tenant even with auth=native.
  // The Generic provider uses the same OceanBase JDBC driver but keeps the selector intact.
  if (oceanBaseOracle) fields.driver = "jumpserver-oceanbase-oracle";
  if (context.protocol === "oracle" && context.connect_options?.use_sysdba === true) {
    fields.auth = "oracle_native";
    fields["authProp.oracle.logon-as"] = "SYSDBA";
  }
  if (context.protocol === "db2") {
    fields["prop.securityMechanism"] = "3";
    fields["prop.sslConnection"] = "false";
  }
  if (context.protocol === "clickhouse") fields.driver = clickHouseNative ? "jumpserver-clickhouse-native" : "com_clickhouse";
  if (Object.values(fields).some((value) => /[|\0]/.test(String(value)))) {
    throw new Error("DBeaver connection values contain a reserved delimiter");
  }
  return {
    type: "args",
    args: [
      ...(workspaceDriver ? ["-data", await prepareDriverWorkspace(context.config_dir, workspaceDriver)] : []),
      "-con",
      Object.entries(fields)
        .map(([key, value]) => `${key}=${value}`)
        .join("|")
    ]
  };
}
