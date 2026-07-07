export const WEB_CLI_NATIVE_VALUE = "web_cli_native";
export const SFTP_FILE_MANAGER_VALUE = "sftp_file_manager";
export const SFTP_FILE_EDITOR_VALUE = "sftp_file_editor";
export const K8S_NATIVE_VALUE = "k8s_native";

export type WorkspaceComponentId = "koko";
export type WorkspaceSurfaceKind = "terminal" | "file-manager" | "file-editor" | "k8s-ui";

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
    protocols: [
      "ssh",
      "telnet",
      "mariadb",
      "mongodb",
      "mysql",
      "oracle",
      "postgresql",
      "redis",
      "sqlserver"
    ],
    connectMethods: [WEB_CLI_NATIVE_VALUE],
    description: "字符型连接统一走 koko 终端 workspace，覆盖主机协议和数据库协议。"
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
    description: "K8s 连接使用 koko Kubernetes UI workspace。"
  }
];

export const K8S_PROTOCOLS = new Set(
  COMPONENT_WORKSPACE_CAPABILITIES
    .filter((item) => item.surface === "k8s-ui")
    .flatMap((item) => item.protocols)
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
