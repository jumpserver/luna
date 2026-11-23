import { isIP } from "node:net";
import { connectionFor, run } from "../../../shared/macos-db/launch.mjs";

const dataGripDrivers = new Map([
  ["mysql", "MySQL"],
  ["postgresql", "PostgreSQL"],
  ["mongodb", "MongoDB"],
  ["db2", "IBM Db2 for 11.X, 12.X"]
]);

function dataGripUrl(protocol, address, port, database, options) {
  const ipv6 = isIP(address) === 6;
  const authority = ipv6 ? `[${address}]:${port}` : `${address}:${port}`;
  const encodedDatabase = encodeURIComponent(database);
  switch (protocol) {
    case "mysql":
    case "postgresql":
      return `jdbc:${protocol}://${authority}/${encodedDatabase}`;
    case "sqlserver": {
      const endpoint = ipv6 ? `;serverName=${address};portNumber=${port}` : authority;
      const catalog = database ? `;databaseName={${database.replaceAll("}", "}}")}}` : "";
      return `jdbc:sqlserver://${endpoint}${catalog};encrypt=false`;
    }
    case "oracle":
      if (!/^[a-z\d_.-]+$/i.test(database)) throw new Error("Invalid Oracle service name");
      return `jdbc:oracle:thin:@//${authority}/${database}`;
    case "mongodb":
      return `mongodb://${authority}/${encodedDatabase}?authSource=admin&loadBalanced=true&retryWrites=false`;
    case "redis":
      if (database && !/^\d+$/.test(database)) throw new Error("Invalid Redis database index");
      return `jdbc:redis://${authority}/${database || "0"}`;
    case "db2":
      if (!database || /[:;/?#]/.test(database)) throw new Error("Invalid Db2 database name");
      return `jdbc:db2://${authority}/${database}:securityMechanism=3;sslConnection=false;`;
    case "clickhouse":
      if (options?.clickhouse_http !== true) return null;
      return `jdbc:clickhouse://${authority}/${encodedDatabase}`;
    default:
      throw new Error("Unsupported database protocol");
  }
}

export function prepareConnection(input) {
  const connection = connectionFor(input);
  const { protocol, connect_options: options } = input;
  const jdbc = dataGripUrl(protocol, connection.host, Number(connection.port), connection.database, options);
  if (jdbc === null) return null;
  return {
    ...connection,
    jdbc,
    driver: dataGripDrivers.get(protocol),
    sysdba: protocol === "oracle" && options?.use_sysdba === true
  };
}

if (import.meta.main) process.exitCode = await run(import.meta.url, prepareConnection);
