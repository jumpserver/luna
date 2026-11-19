function quote(value) {
  const text = String(value);
  if (text.includes("\0")) throw new Error("Invalid command argument");
  return `'${text.replaceAll("'", "'\\''")}'`;
}
export default function (context) {
  if (context.command) return { type: "terminal", command: context.command };
  const { protocol, username, value, host, port, dbname } = context;
  let args;
  switch (protocol) {
    case "mysql":
    case "mariadb":
      args = ["mysql", "-u", username, `-p${value}`, "-h", host, "-P", port, ...(dbname ? [dbname] : [])];
      break;
    case "oracle":
      args = ["sqlplus", `${username}/${value}@${host}:${port}/${dbname}`];
      if (context.connect_options?.use_sysdba === true) args.push("as", "sysdba");
      break;
    case "dameng":
      args = ["disql", `${username}/${value}@${host}:${port}`];
      break;
    case "redis":
      args = ["redis-cli", "-h", host, "-p", port, "-a", `${username}@${value}`];
      break;
    case "sqlserver":
      args = ["sqlcmd", "-S", `${host},${port}`, "-U", username, "-P", value, "-d", dbname];
      break;
    case "postgresql": {
      const pq = (text) => `'${String(text).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
      const connection = Object.entries({ user: username, password: value, host, dbname, port })
        .map(([key, text]) => `${key}=${pq(text)}`)
        .join(" ");
      args = ["psql", connection];
      break;
    }
    case "mongodb":
      args = [
        "mongosh",
        `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(value)}@${
          host
        }:${port}/${encodeURIComponent(dbname)}?authSource=admin&loadBalanced=true&retryWrites=false`
      ];
      break;
    default:
      throw new Error("Unsupported database CLI protocol");
  }
  return { type: "terminal", command: args.map(quote).join(" ") };
}
