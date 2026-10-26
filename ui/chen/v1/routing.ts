import { canonicalChenDialect, chenSqlDialects } from "~/chen/utils/sqlDialect";

export function useGoChenProtocol(
  protocol: string,
  configuredProtocols: unknown = Object.keys(chenSqlDialects).join(",")
) {
  const canonical = canonicalChenDialect(protocol);
  if (!canonical) return false;
  return String(configuredProtocols || "")
    .split(",")
    .some((entry) => canonicalChenDialect(entry) === canonical);
}
