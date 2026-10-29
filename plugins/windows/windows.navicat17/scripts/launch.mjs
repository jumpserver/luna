export function prepareNavicatName(raw) {
  const input = Buffer.from(String(raw || ""));
  const decoded = [];
  for (let index = 0; index < input.length; index++) {
    const byte = input[index];
    if (byte === 43) decoded.push(32);
    else if (byte === 37) {
      const pair = input.subarray(index + 1, index + 3).toString("latin1");
      if (!/^[0-9a-fA-F]{2}$/.test(pair)) return "";
      decoded.push(Number.parseInt(pair, 16));
      index += 2;
    } else decoded.push(byte);
  }
  return Buffer.from(decoded).toString("utf8").replaceAll(" ", "").replace(/[:-]/g, "_");
}

// Navicat 18 Lite accepts -uri followed by one URI argument; no AutoIt key escaping.
export function getNavicatURL(context) {
  const aliases = { mysql: "mysql", mariadb: "mysql", oracle: "ora", postgresql: "pgsql", sqlserver: "mssql" };
  if (!Object.hasOwn(aliases, context.protocol)) throw new Error("Navicat protocol is invalid");
  const sourceName = context.source_name === undefined ? String(context.name || "") : prepareNavicatName(context.source_name);
  const name = /@([^\n]+)$(?![\s\S])/.exec(sourceName)?.[1] || String(context.username || "");
  const query = new URLSearchParams({
    "Conn.Host": String(context.host || ""),
    "Conn.Name": name,
    "Conn.Port": String(context.port ?? ""),
    "Conn.Username": String(context.username || ""),
    "Conn.Password": String(context.value || "")
  });
  if (context.protocol === "oracle") {
    query.set("Conn.ServiceName", String(context.dbname || ""));
    query.set("Conn.ServiceNameType", "ServiceName");
    query.set("Conn.ConnectionMode", "Basic");
  } else if (context.protocol === "sqlserver") {
    query.set("Conn.AuthenticationType", "Default");
    query.set("Conn.InitialDatabase", String(context.dbname || ""));
  } else if (context.protocol === "postgresql") {
    query.set("Conn.InitialDatabase", String(context.dbname || ""));
  }
  return `navicat://conn.${aliases[context.protocol]}?${query}`;
}

export default function buildLaunchPlan(context) {
  if (String(context.command || "").trim()) throw new Error("Navicat cannot open command payloads");
  return { type: "args", args: ["-uri", getNavicatURL(context)] };
}
