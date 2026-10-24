export default function (context) {
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
  if (Object.values(fields).some((value) => /[|\0]/.test(String(value)))) {
    throw new Error("DBeaver connection values contain a reserved delimiter");
  }
  return {
    type: "args",
    args: [
      "-con",
      Object.entries(fields)
        .map(([key, value]) => `${key}=${value}`)
        .join("|")
    ]
  };
}
