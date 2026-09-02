export interface WorkspaceTitleSettings {
  XPACK_LICENSE_IS_VALID?: boolean;
  INTERFACE?: {
    login_title?: string;
  };
}

export const COMMUNITY_WORKSPACE_BRAND = "JumpServer";
export const WORKSPACE_BRAND_STATE_KEY = "web-workspace-brand";

export function resolveWorkspaceBrand(settings: WorkspaceTitleSettings | null | undefined) {
  if (settings?.XPACK_LICENSE_IS_VALID !== true) return COMMUNITY_WORKSPACE_BRAND;

  const loginTitle = settings.INTERFACE?.login_title?.trim();
  return loginTitle || COMMUNITY_WORKSPACE_BRAND;
}

export function formatWorkspaceTitle(brand: string, workspaceLabel: string) {
  return `Luna - ${brand} ${workspaceLabel}`;
}
