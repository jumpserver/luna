import { withBase } from "ufo";

const iconMap: Record<string, string> = {
  windows: "/icons/windows.svg",
  linux: "/icons/linux.svg",
  unix: "/icons/linux.svg",
  other: "/icons/linux.svg",
  mysql: "/icons/mysql.svg",
  mariadb: "/icons/mariadb.svg",
  oracle: "/icons/oracle.svg",
  postgresql: "/icons/postgre.svg",
  sqlserver: "/icons/sqlserver.svg",
  redis: "/icons/redis.svg",
  mongodb: "/icons/mongodb.svg",
  dameng: "/icons/dameng.png",
  db2: "/icons/db2.png",
  clickhouse: "/icons/clickhouse.svg",
  windows_ad: "/icons/windows.svg",
  website: "/icons/chrome.svg",
  web: "/icons/chrome.svg",
  k8s: "/icons/kubernetes.svg",
  kubernetes: "/icons/kubernetes.svg",
  database: "",
  device: ""
};

const withAppBase = (src: string, baseURL: string) => (src ? withBase(src, baseURL) : "");

function resolveAssetIconPath(type?: string) {
  const key = String(type || "linux").toLowerCase();
  if (Object.hasOwn(iconMap, key)) return iconMap[key]!;
  if (key.includes("k8s") || key.includes("kubernetes")) return iconMap.kubernetes!;
  if (key.includes("linux") || key.includes("unix")) return iconMap.linux!;
  if (key.includes("windows")) return iconMap.windows!;
  if (key.includes("web")) return iconMap.website!;
  if (key.includes("mysql")) return iconMap.mysql!;
  if (key.includes("mariadb")) return iconMap.mariadb!;
  if (key.includes("oracle")) return iconMap.oracle!;
  if (key.includes("postgres")) return iconMap.postgresql!;
  if (key.includes("sqlserver")) return iconMap.sqlserver!;
  if (key.includes("redis")) return iconMap.redis!;
  if (key.includes("mongodb")) return iconMap.mongodb!;
  if (key.includes("dameng")) return iconMap.dameng!;
  if (key.includes("db2")) return iconMap.db2!;
  if (key.includes("clickhouse")) return iconMap.clickhouse!;
  if (key.includes("database")) return iconMap.database!;
  return "";
}

export function resolveAssetIconSrc(type?: string, baseURL = "/") {
  return withAppBase(resolveAssetIconPath(type), baseURL);
}

export function resolveAssetIconFallback(type?: string) {
  const key = String(type || "").toLowerCase();
  if (key.includes("database")) return "i-tabler-database-filled";
  if (key.includes("device")) return "i-lucide-router";
  return "i-lucide-terminal";
}

export function resolveAssetIconFromFields(
  fields: { type?: string; platform?: string; category?: string },
  baseURL = "/"
) {
  return resolveAssetIconFromCandidates([fields.platform, fields.type, fields.category], baseURL);
}

export function resolveAssetIconFromCandidates(values: (string | undefined)[], baseURL = "/") {
  const candidates = values.map((value) => String(value || "").toLowerCase()).filter(Boolean);

  const has = (keyword: string) => candidates.some((value) => value.includes(keyword));
  const resolve = (src: string, fallback: string) => ({ src: withAppBase(src, baseURL), fallback });

  if (has("k8s") || has("kubernetes")) return resolve(iconMap.kubernetes!, "i-lucide-container");
  if (has("linux") || has("unix")) return resolve(iconMap.linux!, "i-lucide-terminal");
  if (has("windows")) return resolve(iconMap.windows!, "i-lucide-terminal");
  if (has("mysql")) return resolve(iconMap.mysql!, "i-lucide-database");
  if (has("mariadb")) return resolve(iconMap.mariadb!, "i-lucide-database");
  if (has("oracle")) return resolve(iconMap.oracle!, "i-lucide-database");
  if (has("postgres")) return resolve(iconMap.postgresql!, "i-lucide-database");
  if (has("sqlserver")) return resolve(iconMap.sqlserver!, "i-lucide-database");
  if (has("redis")) return resolve(iconMap.redis!, "i-lucide-database");
  if (has("mongodb")) return resolve(iconMap.mongodb!, "i-lucide-database");
  if (has("dameng")) return resolve(iconMap.dameng!, "i-lucide-database");
  if (has("db2")) return resolve(iconMap.db2!, "i-lucide-database");
  if (has("clickhouse")) return resolve(iconMap.clickhouse!, "i-lucide-database");
  if (has("web")) return resolve(iconMap.website!, "i-lucide-globe");
  if (has("database")) return resolve(iconMap.database!, "i-tabler-database-filled");
  if (has("device")) return { src: "", fallback: "i-lucide-router" };

  for (const candidate of candidates) {
    const src = resolveAssetIconSrc(candidate, baseURL);
    if (src) return { src, fallback: resolveAssetIconFallback(candidate) };
  }

  return { src: "", fallback: "i-lucide-terminal" };
}
