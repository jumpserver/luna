export const WEB_CLI_NATIVE_VALUE = "web_cli_native";
export const WEB_RDP_NATIVE_VALUE = "web_rdp_native";
export const WEB_DB_NATIVE_VALUE = "web_db_native";
export const SFTP_FILE_MANAGER_VALUE = "sftp_file_manager";
export const SFTP_FILE_EDITOR_VALUE = "sftp_file_editor";
export const K8S_NATIVE_VALUE = "k8s_native";
export const WEB_PROXY_NATIVE_VALUE = "web_proxy_native";

export type WorkspaceComponentId = "koko" | "chen" | "lion";
export type WorkspaceSurfaceKind =
  | "terminal"
  | "database"
  | "file-manager"
  | "file-editor"
  | "k8s-ui"
  | "remote-desktop"
  | "web-browser";

export interface WorkspaceCapabilityDeclaration {
  component: WorkspaceComponentId;
  surface: WorkspaceSurfaceKind;
  label: string;
  protocols: string[];
  connectMethods: string[];
  backendConnectMethod?: string;
  description: string;
}

export const COMPONENT_WORKSPACE_CAPABILITIES: WorkspaceCapabilityDeclaration[] = [
  {
    component: "koko",
    surface: "terminal",
    label: "ConnectMethod.BuiltinTerminal",
    protocols: ["ssh", "telnet", "mariadb", "mongodb", "mysql", "oracle", "postgresql", "redis", "sqlserver"],
    connectMethods: [WEB_CLI_NATIVE_VALUE],
    backendConnectMethod: "web_cli",
    description: "ConnectMethod.BuiltinTerminalDescription"
  },
  {
    component: "chen",
    surface: "database",
    label: "ConnectMethod.DatabaseWorkbench",
    protocols: [
      "clickhouse",
      "dameng",
      "db2",
      "mariadb",
      "mongodb",
      "mysql",
      "oracle",
      "postgresql",
      "redis",
      "sqlserver"
    ],
    connectMethods: [WEB_DB_NATIVE_VALUE],
    description: "ConnectMethod.DatabaseWorkbenchDescription"
  },
  {
    component: "koko",
    surface: "file-manager",
    label: "ConnectMethod.FileManager",
    protocols: ["sftp"],
    connectMethods: [SFTP_FILE_MANAGER_VALUE],
    backendConnectMethod: "web_sftp",
    description: "ConnectMethod.FileManagerDescription"
  },
  {
    component: "koko",
    surface: "file-editor",
    label: "ConnectMethod.FileEditor",
    protocols: ["sftp"],
    connectMethods: [SFTP_FILE_EDITOR_VALUE],
    backendConnectMethod: "web_sftp",
    description: "ConnectMethod.FileEditorDescription"
  },
  {
    component: "koko",
    surface: "k8s-ui",
    label: "ConnectMethod.Kubernetes",
    protocols: ["k8s", "kubernetes"],
    connectMethods: [K8S_NATIVE_VALUE],
    backendConnectMethod: "web_cli",
    description: "ConnectMethod.KubernetesDescription"
  },
  {
    component: "lion",
    surface: "remote-desktop",
    label: "ConnectMethod.RemoteDesktop",
    protocols: ["rdp", "vnc"],
    connectMethods: [WEB_RDP_NATIVE_VALUE],
    description: "ConnectMethod.RemoteDesktopDescription"
  },
  {
    component: "koko",
    surface: "web-browser",
    label: "ConnectMethod.BuiltinWebProxy",
    protocols: ["http", "https"],
    connectMethods: [WEB_PROXY_NATIVE_VALUE],
    backendConnectMethod: "web_proxy",
    description: "ConnectMethod.BuiltinWebProxyDescription"
  }
];

export const K8S_PROTOCOLS = new Set(
  COMPONENT_WORKSPACE_CAPABILITIES.filter((item) => item.surface === "k8s-ui").flatMap((item) => item.protocols)
);

export function findDeclaredCapability(
  protocol: string,
  connectMethod?: string
): WorkspaceCapabilityDeclaration | undefined {
  const normalizedProtocol = protocol.trim().toLowerCase();
  const normalizedMethod = connectMethod?.trim().toLowerCase();

  return COMPONENT_WORKSPACE_CAPABILITIES.find((item) => {
    const supportsProtocol = item.protocols.includes(normalizedProtocol);
    if (!supportsProtocol) return false;
    if (!normalizedMethod) return true;
    return item.connectMethods.some((method) => method.toLowerCase() === normalizedMethod);
  });
}
