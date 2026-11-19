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
  if (context.protocol === "mysql" && context.connect_options?.oceanbase_tenant_mode === "oracle") {
    // DBX 0.6.72 needs both the OceanBase URI scheme and its Oracle profile.
    // The nested URL contains only the Magnus endpoint, never credentials.
    const rawHost = String(context.host);
    const host = rawHost.includes(":") && !rawHost.startsWith("[") ? `[${rawHost}]` : rawHost;
    const endpoint = new URL(`oceanbase://${host}:${context.port}`);
    if (
      !endpoint.hostname ||
      endpoint.username ||
      endpoint.password ||
      endpoint.pathname ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error("Invalid OceanBase proxy endpoint");
    endpoint.pathname = `/${encodeURIComponent(context.dbname || "")}`;
    query.set("type", "oceanbase-oracle");
    query.set("url", endpoint.href);
    query.set("ssl", "false");
  }
  if (context.protocol === "mongodb") query.set("url_params", "authSource=admin&loadBalanced=true&retryWrites=false");
  if (context.protocol === "db2") {
    query.set("ssl", "false");
    query.set("url_params", "securityMechanism=3;sslConnection=false;");
  }
  if (context.protocol === "clickhouse") query.set("ssl", "false");
  return { type: "args", args: [`dbx://connection/new?${query}`] };
}
