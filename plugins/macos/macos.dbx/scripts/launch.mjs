export default function (context) {
  if (context.command) throw new Error("DBX does not accept terminal commands");
  const aliases = { postgresql: "postgres", sqlserver: "mssql", dameng: "dm", mariadb: "mysql" };
  const query = new URLSearchParams({
    name: context.name,
    type: aliases[context.protocol] || context.protocol,
    host: context.host,
    port: String(context.port),
    user: context.username,
    password: context.value,
    database: context.dbname,
    one_time: "true"
  });
  if (context.protocol === "mongodb") query.set("url_params", "authSource=admin&loadBalanced=true&retryWrites=false");
  if (context.protocol === "db2") {
    query.set("ssl", "false");
    query.set("url_params", "securityMechanism=3;sslConnection=false;");
  }
  if (context.protocol === "clickhouse") query.set("ssl", "false");
  return { type: "args", args: [`dbx://connection/new?${query}`] };
}
