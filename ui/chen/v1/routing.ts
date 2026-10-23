import { canonicalChenDialect } from "~/chen/utils/sqlDialect";

export function useGoChenProtocol(protocol: string, configuredProtocols: unknown) {
  const canonical = canonicalChenDialect(protocol);
  if (!canonical) return false;
  return String(configuredProtocols || "")
    .split(",")
    .some((entry) => canonicalChenDialect(entry) === canonical);
}
