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

export function resolveAssetIconSrc(type?: string) {
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

export function resolveAssetIconFallback(type?: string) {
  const key = String(type || "").toLowerCase();
  if (key.includes("device")) return "i-lucide-router";
  return "i-lucide-terminal";
}

export function resolveAssetIconFromFields(fields: {
  type?: string
  platform?: string
  category?: string
}) {
  const candidates = [fields.platform, fields.type, fields.category]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  const has = (keyword: string) => candidates.some((value) => value.includes(keyword));

  if (has("linux") || has("unix")) return { src: iconMap.linux!, fallback: "i-lucide-terminal" };
  if (has("windows")) return { src: iconMap.windows!, fallback: "i-lucide-terminal" };
  if (has("web")) return { src: iconMap.website!, fallback: "i-lucide-globe" };
  if (has("mysql")) return { src: iconMap.mysql!, fallback: "i-lucide-database" };
  if (has("mariadb")) return { src: iconMap.mariadb!, fallback: "i-lucide-database" };
  if (has("oracle")) return { src: iconMap.oracle!, fallback: "i-lucide-database" };
  if (has("postgres")) return { src: iconMap.postgresql!, fallback: "i-lucide-database" };
  if (has("sqlserver")) return { src: iconMap.sqlserver!, fallback: "i-lucide-database" };
  if (has("redis")) return { src: iconMap.redis!, fallback: "i-lucide-database" };
  if (has("mongodb")) return { src: iconMap.mongodb!, fallback: "i-lucide-database" };
  if (has("dameng")) return { src: iconMap.dameng!, fallback: "i-lucide-database" };
  if (has("clickhouse")) return { src: iconMap.clickhouse!, fallback: "i-lucide-database" };
  if (has("database")) return { src: iconMap.database!, fallback: "i-lucide-database" };
  if (has("device")) return { src: "", fallback: "i-lucide-router" };

  for (const candidate of candidates) {
    const src = resolveAssetIconSrc(candidate);
    if (src) return { src, fallback: resolveAssetIconFallback(candidate) };
  }

  return { src: "", fallback: "i-lucide-terminal" };
}
