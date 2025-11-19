import type { DropdownMenuItem } from "@nuxt/ui";

export type ActionType = "action" | "select";
export type SortType = "name" | "-name" | "-date_updated" | "date_updated";
export type ThemeType = "light" | "dark" | "withSystem" | "";
export type LayoutsType = "grid" | "table";
export type LangType = "zh" | "en";
export type CharsetType = "default" | "utf8" | "gbk" | "gb2312" | "ios-8859-1";
export type ResolutionType = "auto" | "1024x768" | "1366x768" | "1600x900" | "1920x1080";

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

export interface AppConfigType {
  terminal: ConfigItem[];
  remotedesktop: ConfigItem[];
  filetransfer: ConfigItem[];
  databases: ConfigItem[];
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

export interface RoleType {
  display_name: string;
  id: string;
}

export interface UserData {
  site: string;
  name: string;
  language: string;
  headerJson: string;
  system_roles: RoleType[];
  org: CurrentOrg;
  availableOrgs: PermOrgItem[];
  connectionInfo: ConnectionInfo;
  xpackLicenseValid?: boolean;
}

export interface UserIntiInfo {
  status: string;
  cookies: string;
  version?: string;
  xpack_license_valid?: boolean;
  resolved_site?: string;
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

export interface UserItem {
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
  permedProtocols?: PermedProtocol[];
  permedAccounts?: PermedAccount[];
}

export interface AssetItem {
  id: string;
  name: string;
  address: string;
  user?: string;
  platform: string;
  zone: string;
  isActive: boolean;
  comment?: string;
  category: string;
  type: string;
  permedProtocols?: PermedProtocol[];
  permedAccounts?: PermedAccount[];
  displayAddressLine?: string;
  savedConnection?: ConnectionInfo;
  isFavorite?: boolean;
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
  accountId?: string;
  accountMode?: "hosted" | "dynamic" | "manual";
  manualUsername?: string;
  manualPassword?: string;
  rememberSecret?: boolean;
  dynamicPassword?: string;
  availableProtocols?: string[];
}

export interface RdpGraphics {
  rdp_resolution?: string;
  resolution?: string;
  keyboard_layout?: string;
  rdp_client_option?: string[];
  rdp_color_quality?: string;
  rdp_smart_size?: string;
  applet_connection_method?: string;
  file_name_conflict_resolution?: string;
}

export interface SettingResponse {
  basic: {
    is_async_asset_tree: boolean;
    connect_default_open_method: string;
  };
  graphics: RdpGraphics;
  command_line: {
    character_terminal_font_size: number;
    is_backspace_as_ctrl_h: boolean;
    is_right_click_quickly_paste: boolean;
    terminal_theme_name: string;
    charset?: CharsetType;
  };
}

export interface ConnectionBody {
  asset: string;
  account: string;
  protocol: string;
  input_username: string;
  input_secret: string;
  connect_method: string;
  connect_options: RdpGraphics;
}

export interface TokenResponse {
  account: string;
  actions: [];
  asset: AssetNode;
  asset_display: string;
  connect_method: string;
  connect_options: RdpGraphics;
  created_by: string;
  date_created: string;
  date_expired: string;
  date_updated: string;
  expire_time: number;
  face_monitor_token: string;
  from_ticket: any;
  from_ticket_info: any;
  id: string;
  input_username: string;
  is_active: boolean;
  is_expired: boolean;
  is_reusable: boolean;
  org_id: string;
  org_name: string;
  protocol: string;
  remote_addr: string;
  updated_by: string;
  user: UserItem;
  user_display: string;
  value: string;
}

export interface UserSettingPersistedState {
  language: LangType;
  siteLanguages: Record<string, LangType>;
  collapse: boolean;
  sort: SortType;
  theme: ThemeType;
  followSystem: boolean;
  layouts: LayoutsType;
  fontFamily: string;
  primaryColor: string;
  primaryColorLight: string;
  primaryColorDark: string;
  appConfig?: AppConfigType | null;
  charset: CharsetType;
  rdpResolution: ResolutionType;
  backspaceAsCtrlH: boolean;
  keyboardLayout: string;
  rdpClientOption: string[];
  rdpColorQuality: string;
  rdpSmartSize: string;
}
