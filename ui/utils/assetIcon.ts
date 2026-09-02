import { withBase } from "ufo";

const iconMap: Record<string, string> = {
  windows: "/icons/windows.png",
  linux: "/icons/linux.png",
  unix: "/icons/linux.png",
  other: "/icons/linux.png",
  mysql: "/icons/mysql.png",
  mariadb: "/icons/mariadb.png",
  oracle: "/icons/oracle.png",
  postgresql: "/icons/postgre.png",
  sqlserver: "/icons/sqlserver.png",
  redis: "/icons/redis.png",
  mongodb: "/icons/mongodb.png",
  dameng: "/icons/dameng.png",
  clickhouse: "/icons/clickhouse.png",
  windows_ad: "/icons/windows.png",
  website: "/icons/browser.png",
  web: "/icons/browser.png",
  database: "/icons/mysql.png",
  device: ""
};

const withAppBase = (src: string, baseURL: string) => (src ? withBase(src, baseURL) : "");

function resolveAssetIconPath(type?: string) {
  const key = String(type || "linux").toLowerCase();
  if (iconMap[key]) return iconMap[key];
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
  if (key.includes("clickhouse")) return iconMap.clickhouse!;
  if (key.includes("database")) return iconMap.database!;
  return "";
}

export function resolveAssetIconSrc(type?: string, baseURL = "/") {
  return withAppBase(resolveAssetIconPath(type), baseURL);
}

export function resolveAssetIconFallback(type?: string) {
  const key = String(type || "").toLowerCase();
  if (key.includes("device")) return "i-lucide-router";
  return "i-lucide-terminal";
}

export function resolveAssetIconFromFields(
  fields: { type?: string; platform?: string; category?: string },
  baseURL = "/"
) {
  const candidates = [fields.platform, fields.type, fields.category]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  const has = (keyword: string) => candidates.some((value) => value.includes(keyword));
  const resolve = (src: string, fallback: string) => ({ src: withAppBase(src, baseURL), fallback });

  if (has("linux") || has("unix")) return resolve(iconMap.linux!, "i-lucide-terminal");
  if (has("windows")) return resolve(iconMap.windows!, "i-lucide-terminal");
  if (has("web")) return resolve(iconMap.website!, "i-lucide-globe");
  if (has("mysql")) return resolve(iconMap.mysql!, "i-lucide-database");
  if (has("mariadb")) return resolve(iconMap.mariadb!, "i-lucide-database");
  if (has("oracle")) return resolve(iconMap.oracle!, "i-lucide-database");
  if (has("postgres")) return resolve(iconMap.postgresql!, "i-lucide-database");
  if (has("sqlserver")) return resolve(iconMap.sqlserver!, "i-lucide-database");
  if (has("redis")) return resolve(iconMap.redis!, "i-lucide-database");
  if (has("mongodb")) return resolve(iconMap.mongodb!, "i-lucide-database");
  if (has("dameng")) return resolve(iconMap.dameng!, "i-lucide-database");
  if (has("clickhouse")) return resolve(iconMap.clickhouse!, "i-lucide-database");
  if (has("database")) return resolve(iconMap.database!, "i-lucide-database");
  if (has("device")) return { src: "", fallback: "i-lucide-router" };

  for (const candidate of candidates) {
    const src = resolveAssetIconSrc(candidate, baseURL);
    if (src) return { src, fallback: resolveAssetIconFallback(candidate) };
  }

  return { src: "", fallback: "i-lucide-terminal" };
}
