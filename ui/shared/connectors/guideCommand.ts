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

  switch (protocol) {
    case "ssh":
      return `ssh JMS-${id}@${host}${port === "22" ? "" : ` -p ${port}`}`;
    case "vnc":
      return `vncviewer -UserName=${id} ${host}:${port || "5900"}`;
    case "mysql":
    case "mariadb":
      return `mysql -u ${id} -p${secret} -h ${host} -P ${port} ${database}`;
    case "postgresql":
      return `psql "user=${id} password=${secret} host=${host} dbname=${database} port=${port}"`;
    case "redis":
      return `redis-cli -h ${host} -p ${port} -a ${input.redisAuth || ""}`;
    case "oracle":
      return `sqlplus ${id}/${secret}@${host}:${port}/${id}`;
    case "sqlserver":
      return `sqlcmd -S ${host},${port} -U ${id} -P ${secret} -d ${database}`;
    case "mongodb":
      return `mongosh "mongodb://${id}:${secret}@${host}:${port}/${database}?authSource=admin&loadBalanced=true&retryWrites=false"`;
    default:
      return "";
  }
}
