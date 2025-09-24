import type { DropdownMenuItem } from '@nuxt/ui';

type ActionType = 'action' | 'select';
export type SortType = 'name' | '-name' | '-date_updated' | 'date_updated';

export interface ActionItem {
  key: string;
  iconName: string;
  tooltipLabel: string;
  type: ActionType;
  selectItems?: DropdownMenuItem[];
  onClick?: () => void;
}

export interface ConfigItem {
  name: string;
  display_name: string;
  protocol: string[];
  comment: {
    zh: string;
    en: string;
  };
  download_url: string;
  type: string;
  path: string;
  arg_format: string;
  match_first: string[];
  is_internal: boolean;
  is_default: boolean;
  is_set: boolean;
}

export interface Cookies {
  path: string;
  name: string;
  value: string;
  domain: string;
  secure: boolean;
  httpOnly: boolean;
}

export interface PermOrgItem {
  id: string;
  name: string;
  is_root: boolean;
  is_default: boolean;
  is_system: boolean;
}

export interface CurrentOrg extends PermOrgItem {
  comment: string;
}

export interface PermissionOrgs {
  pam_orgs?: PermOrgItem[];
  audit_orgs?: PermOrgItem[];
  console_orgs?: PermOrgItem[];
  workbench_orgs?: PermOrgItem[];
  id: string;
  username: string;
}

export interface UserData {
  site: string;
  name: string;
  headerJson: string;
  system_roles: string[];
  org: CurrentOrg;
  availableOrgs: PermOrgItem[];
  connectionInfo: ConnectionInfo;
}

export interface UserIntiInfo {
  status: string;
  cookies: string;
  profile: {
    data: string;
  };
  current_org: {
    data: string;
  };
  permission_orgs: {
    data: string;
  };
}

export interface AssetCategory {
  value: string;
  label: string;
}

export interface AssetConnectivity {
  value: string;
  label: string;
}

export interface AssetNode {
  id: string;
  name: string;
}

export interface AssetPlatform {
  id: number;
  name: string;
}

export interface AssetType {
  value: string;
  label: string;
}

export interface AssetZone {
  id: string;
  name: string;
}

export interface PermedProtocol {
  name: string;
  port: number;
  public: boolean;
  setting?: any;
}

export interface Actions {
  label: string;
  value: string;
}

export interface PermedAccount {
  alias: string;
  date_expired: string;
  has_secret: boolean;
  has_username: boolean;
  id: string;
  name: string;
  secret_type: string;
  username: string;
  actions: Actions[];
}

export interface RawAssetData {
  id: string;
  name?: string;
  address?: string;
  category?: AssetCategory;
  comment?: string;
  connectivity?: AssetConnectivity;
  created_by?: string;
  date_created?: string;
  date_verified?: string | null;
  is_active?: boolean;
  labels?: string[];
  nodes?: AssetNode[];
  org_id?: string;
  org_name?: string;
  platform?: AssetPlatform;
  type?: AssetType;
  zone?: AssetZone;
  permed_protocols?: PermedProtocol[];
  permed_accounts?: PermedAccount[];
}

export interface AssetItem {
  id: string;
  assetName: string;
  address: string;
  user?: string;
  platform: string;
  zone: string;
  isActive: boolean;
  comment?: string;
  permed_protocols?: PermedProtocol[];
  permed_accounts?: PermedAccount[];
}

export interface AssetsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RawAssetData[];
}

export interface ConnectionInfo {
  protocol: string;
  username: string;
}

export interface SettingResponse {
  basic: {
    is_async_asset_tree: boolean;
    connect_default_open_method: string;
  };
  graphics: {
    rdp_resolution: string;
    keyboard_layout: string;
    rdp_client_option: string[];
    rdp_color_quality: string;
    rdp_smart_size: string;
    applet_connection_method: string;
    file_name_conflict_resolution: string;
  };
  command_line: {
    character_terminal_font_size: number;
    is_backspace_as_ctrl_h: boolean;
    is_right_click_quickly_paste: boolean;
    terminal_theme_name: string;
  };
}
