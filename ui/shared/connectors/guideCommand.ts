// Client-facing only: retain the original asset/token protocol for backend routing.
export function getGuideClientProtocol(protocol: string) {
  const normalized = protocol.trim().toLowerCase();
  return normalized === "mariadb" ? "mysql" : normalized;
}

export function getGuideConnectCommand(input: {
  protocol: string;
  id: string;
  secret: string;
  host: string;
  port: string;
  database: string;
  redisAuth?: string;
}) {
  const { protocol, id, secret, host, port, database } = input;

  switch (getGuideClientProtocol(protocol)) {
    case "ssh":
      return `ssh JMS-${id}@${host}${port === "22" ? "" : ` -p ${port}`}`;
    case "vnc":
      return `vncviewer -UserName=${id} ${host}:${port || "5900"}`;
    case "mysql":
      return `mysql -u ${id} -p${secret} -h ${host} -P ${port} ${database}`;
    case "postgresql":
      return `psql "user=${id} password=${secret} host=${host} dbname=${database} port=${port}"`;
    case "redis":
      return `redis-cli -h ${host} -p ${port} -a ${input.redisAuth || ""}`;
    case "oracle":
      return `sqlplus ${id}/${secret}@${host}:${port}/${id}`;
    case "dameng":
      return `disql ${id}/${secret}@${host}:${port}`;
    case "sqlserver":
      return `sqlcmd -S ${host},${port} -U ${id} -P ${secret} -d ${database}`;
    case "mongodb":
      return `mongosh "mongodb://${id}:${secret}@${host}:${port}/${database}?authSource=admin&loadBalanced=true&retryWrites=false"`;
    default:
      return "";
  }
}
