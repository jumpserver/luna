import {
  K8S_NATIVE_VALUE,
  SFTP_FILE_EDITOR_VALUE,
  SFTP_FILE_MANAGER_VALUE,
  WEB_CLI_NATIVE_VALUE,
  WEB_DB_NATIVE_VALUE,
  WEB_PROXY_NATIVE_VALUE,
  WEB_RDP_NATIVE_VALUE
} from "~/composables/useConnectMethods";

export function categoryOfConnectMethod(method: { value?: string; type?: string }) {
  if (String(method?.value || "").startsWith("native_app:")) return "native";
  if (isBuiltinConnectMethod(method)) return "builtin";

  const type = String(method?.type || "").toLowerCase();

  if (type === "web" || type === "builtin") return "builtin";
  if (["applet", "virtual_app", "remote_app", "remoteapp"].includes(type)) return "remote_app";
  if (["native", "client", "local", "desktop"].includes(type)) return "native";
  return type || "builtin";
}

function isBuiltinConnectMethod(method: { value?: string }) {
  return ["web_cli_native", "web_proxy_native"].includes(String(method?.value || "").toLowerCase());
}

export function islandMethodIcon(value: string) {
  const key = String(value || "").toLowerCase();
  if (key.startsWith("native_app:")) return "i-lucide-app-window";
  if (key === WEB_CLI_NATIVE_VALUE) return "i-lucide-square-terminal";
  if (key === SFTP_FILE_MANAGER_VALUE) return "i-lucide-folder";
  if (key === SFTP_FILE_EDITOR_VALUE) return "i-lucide-file";
  if (key === WEB_DB_NATIVE_VALUE) return "i-lucide-database";
  if (key === WEB_RDP_NATIVE_VALUE) return "i-lucide-monitor";
  if (key === K8S_NATIVE_VALUE) return "i-lucide-boxes";
  if (key === WEB_PROXY_NATIVE_VALUE) return "i-lucide-globe";
  return "i-lucide-box";
}
