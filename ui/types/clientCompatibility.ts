export type CompatibilityFailure = "client-too-old" | "core-too-old";
export type CompatibilityUnknownReason =
  | "endpoint-missing"
  | "timeout"
  | "tls"
  | "network"
  | "http"
  | "invalid-response"
  | "invalid-site"
  | "invalid-client-version";

export interface SiteCompatibility {
  status: "compatible" | "incompatible" | "unknown";
  site: string;
  clientVersion: string;
  minCoreVersion: string;
  coreVersion?: string;
  minClientVersion?: string;
  failures: CompatibilityFailure[];
  reason?: CompatibilityUnknownReason;
}

export interface DesktopConnectionResult {
  status: "success" | "confirmation-required" | "stale" | "failure" | "auth-required";
  compatibility?: SiteCompatibility;
  compatibility_confirmation_id?: number;
  connection_id?: number;
}
