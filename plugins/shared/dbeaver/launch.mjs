import { prepareClickHouseWorkspace } from "./native.mjs";

export default async function prepareDBeaverConnection(context) {
  if (context.command) throw new Error("DBeaver does not accept terminal commands");
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
  if (context.protocol === "oracle" && context.connect_options?.use_sysdba === true) {
    fields.auth = "oracle_native";
    fields["authProp.oracle.logon-as"] = "SYSDBA";
  }
  if (context.protocol === "db2") fields["prop.securityMechanism"] = "3";
  if (context.protocol === "clickhouse") fields.driver = "jumpserver-clickhouse-native";
  if (Object.values(fields).some((value) => /[|\0]/.test(String(value)))) {
    throw new Error("DBeaver connection values contain a reserved delimiter");
  }
  return {
    type: "args",
    args: [
      ...(context.protocol === "clickhouse" ? ["-data", await prepareClickHouseWorkspace(context.config_dir)] : []),
      "-con",
      Object.entries(fields)
        .map(([key, value]) => `${key}=${value}`)
        .join("|")
    ]
  };
}
