// Client-facing only: retain the original asset/token protocol for backend routing.
export function getGuideClientProtocol(protocol: string) {
  const normalized = protocol.trim().toLowerCase();
  return normalized === "mariadb" ? "mysql" : normalized;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function uriComponent(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function getGuideConnectCommand(input: {
  protocol: string;
  id: string;
  secret: string;
  host: string;
  port: string;
  database: string;
  redisAuth?: string;
  useSysDBA?: boolean;
}) {
  const { protocol, id, secret, host, port, database } = input;

  switch (getGuideClientProtocol(protocol)) {
    case "ssh":
      return `ssh JMS-${id}@${host}${port === "22" ? "" : ` -p ${port}`}`;
    case "vnc":
      return `vncviewer -UserName=${id} ${host}:${port || "5900"}`;
    case "mysql":
      return `mysql --protocol=TCP -u ${id} -p${secret} -h ${host} -P ${port} --ssl-mode=DISABLED ${database}`;
    case "postgresql":
      return `psql "user=${id} password=${secret} host=${host} dbname=${database} port=${port} sslmode=disable"`;
    case "redis":
      return `redis-cli -h ${host} -p ${port} -a ${input.redisAuth || ""}`;
    case "oracle":
      return `sqlplus ${id}/${secret}@${host}:${port}/${id}${input.useSysDBA ? " as sysdba" : ""}`;
    case "dameng":
      return `disql ${id}/${secret}@${host}:${port}`;
    case "db2": {
      const address = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
      return `usql ${shellQuote(`db2://${uriComponent(id)}:${uriComponent(secret)}@${address}:${port}/${uriComponent(database)}?secmec=3&ssl=false`)}`;
    }
    case "clickhouse":
      return `clickhouse-client --host=${shellQuote(host)} --port=${shellQuote(port)} --user=${shellQuote(id)} --password=${shellQuote(secret)} --database=${shellQuote(database)}`;
    case "sqlserver":
      return `sqlcmd -S ${host},${port} -U ${id} -P ${secret} -d ${database}`;
    case "mongodb":
      return `mongosh "mongodb://${id}:${secret}@${host}:${port}/${database}?authSource=admin&loadBalanced=true&retryWrites=false"`;
    default:
      return "";
  }
}
