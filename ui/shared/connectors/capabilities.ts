export const WEB_CLI_NATIVE_VALUE = "web_cli_native";
export const WEB_RDP_NATIVE_VALUE = "web_rdp_native";
export const WEB_DB_NATIVE_VALUE = "web_db_native";
export const SFTP_FILE_MANAGER_VALUE = "sftp_file_manager";
export const SFTP_FILE_EDITOR_VALUE = "sftp_file_editor";
export const K8S_NATIVE_VALUE = "k8s_native";

export type WorkspaceComponentId = "koko" | "chen" | "lion";
export type WorkspaceSurfaceKind
  = | "terminal"
    | "database"
    | "file-manager"
    | "file-editor"
    | "k8s-ui"
    | "remote-desktop";

export interface WorkspaceCapabilityDeclaration {
  component: WorkspaceComponentId
  surface: WorkspaceSurfaceKind
  label: string
  protocols: string[]
  connectMethods: string[]
  backendConnectMethod?: string
  description: string
}

export const COMPONENT_WORKSPACE_CAPABILITIES: WorkspaceCapabilityDeclaration[] = [
  {
    component: "koko",
    surface: "terminal",
    label: "内置终端",
    protocols: ["ssh", "telnet", "mariadb", "mongodb", "mysql", "oracle", "postgresql", "redis", "sqlserver"],
    connectMethods: [WEB_CLI_NATIVE_VALUE],
    backendConnectMethod: "web_cli",
    description: "字符型连接统一走 koko 终端 workspace，覆盖主机协议和数据库协议。"
  },
  {
    component: "chen",
    surface: "database",
    label: "数据库工作台",
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
    description: "数据库连接使用 chen workspace，提供资源树、SQL 编辑器和结果视图。"
  },
  {
    component: "koko",
    surface: "file-manager",
    label: "文件管理",
    protocols: ["sftp"],
    connectMethods: [SFTP_FILE_MANAGER_VALUE],
    backendConnectMethod: "web_sftp",
    description: "SFTP 文件管理使用 koko 文件管理 workspace。"
  },
  {
    component: "koko",
    surface: "file-editor",
    label: "File Editor",
    protocols: ["sftp"],
    connectMethods: [SFTP_FILE_EDITOR_VALUE],
    backendConnectMethod: "web_sftp",
    description: "SFTP 文件编辑使用 koko File Editor workspace。"
  },
  {
    component: "koko",
    surface: "k8s-ui",
    label: "Kubernetes",
    protocols: ["k8s", "kubernetes"],
    connectMethods: [K8S_NATIVE_VALUE],
    backendConnectMethod: "web_cli",
    description: "K8s 连接使用 koko Kubernetes UI workspace。"
  },
  {
    component: "lion",
    surface: "remote-desktop",
    label: "远程桌面",
    protocols: ["rdp", "vnc"],
    connectMethods: [WEB_RDP_NATIVE_VALUE],
    description: "RDP/VNC 连接走 Lion 远程桌面 workspace。"
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
