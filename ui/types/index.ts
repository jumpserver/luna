import type { DropdownMenuItem } from "@nuxt/ui";

export type ActionType = "action" | "select";
export type SortType = "name" | "-name" | "-date_updated" | "date_updated";
export type ThemeType = "light" | "dark" | "withSystem" | "";
export type ThemePresetId =
  | "latte"
  | "matcha"
  | "claude"
  | "gemini"
  | "mono"
  | "min"
  | "luna-default"
  | "luna-darkgray"
  | "luna-deepblue"
  | "mocha"
  | "macchiato"
  | "frappe"
  | "kanagawa"
  | "ayu"
  | "rose-pine"
  | "codex"
  | "cursor"
  | "mono-dark"
  | "min-dark";
export type LayoutsType = "grid" | "table";
export type LangType = "zh" | "zh_hant" | "en" | "ja" | "pt_br" | "es" | "ru" | "ko" | "vi";
export type LanguagePreference = LangType | "system";
export type CharsetType = "default" | "utf8" | "gbk" | "gb2312" | "ios-8859-1";
export type ResolutionType = "auto" | "1024x768" | "1366x768" | "1600x900" | "1920x1080";
export type AssetPageType =
  | "assets"
  | "linux"
  | "windows"
  | "windows_ad"
  | "other"
  | "database"
  | "device"
  | "web"
  | "favorite";
export type SidebarSectionKey = "assets" | "favorites" | "snippets";

export interface SidebarSectionVisibility {
  assets: boolean;
  favorites: boolean;
  snippets: boolean;
}

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
  enabled_protocols?: string[];
  is_internal: boolean;
  is_default: boolean;
  is_set: boolean;
  executable_type?: string;
  path_exists?: boolean;
  plugin_id?: string;
  builtin?: boolean;
  icon_path?: string;
  use_ssh_helper?: boolean;
  path_display?: string;
  path_copyable?: boolean;
  path_selectable?: boolean;
}

export interface AppConfigType {
  terminal: ConfigItem[];
  remotedesktop: ConfigItem[];
  filetransfer: ConfigItem[];
  databases: ConfigItem[];
}

export interface PluginListItem {
  id: string;
  name: string;
  display_name: string;
  version: string;
  category: string;
  protocols: string[];
  builtin: boolean;
  enabled: boolean;
  path: string;
  path_exists?: boolean;
  executable_type?: string;
  icon_path?: string;
  plugin_dir?: string;
  download_url?: string;
  comment?: {
    zh?: string;
    en?: string;
  };
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
  comment?: string;
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

export interface LabeledValue<T extends string | number = string> {
  label: string;
  value: T;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar_url?: string;
  phone?: string | { code?: string | null; phone?: string | null } | null;
  wechat?: string | null;
  source?: string | LabeledValue;
  mfa_level?: number | LabeledValue<number>;
  mfa_enabled?: boolean;
  is_active?: boolean;
  is_valid?: boolean;
  is_expired?: boolean;
  date_joined?: string | null;
  last_login?: string | null;
  date_expired?: string | null;
  system_roles?: RoleType[];
  org_roles?: Array<RoleType & { name?: string }>;
}

export interface UserData {
  accountId: string;
  userId?: string;
  siteName: string;
  site: string;
  name: string;
  language?: string;
  bearerToken: string;
  system_roles: RoleType[];
  org: CurrentOrg;
  availableOrgs: PermOrgItem[];
  connectionInfo: ConnectionInfo;
  xpackLicenseValid?: boolean;
  commandExecutionEnabled?: boolean;
}

export interface UserIntiInfo {
  status: string;
  bearer: string;
  version?: string;
  xpack_license_valid?: boolean;
  security_command_execution?: boolean;
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

export type AssetTreeKind = "authorization" | "type" | "search";

export interface AssetTreeNodeMeta {
  type?: string;
  data?: Record<string, any>;
}

export interface AssetTreeNode {
  id: string;
  key?: string;
  pId?: string | null;
  name: string;
  title?: string;
  isParent?: boolean;
  open?: boolean;
  iconSkin?: string;
  type?: string;
  category?: string;
  chkDisabled?: boolean;
  meta?: AssetTreeNodeMeta;
  children?: AssetTreeNode[];
  level?: number;
  loaded?: boolean;
  loading?: boolean;
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
  org_id?: string;
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
  accountMode?: "hosted" | "dynamic" | "manual" | "anonymous";
  manualUsername?: string;
  manualPassword?: string;
  rememberSecret?: boolean;
  dynamicPassword?: string;
  availableProtocols?: string[];
  connectMethod?: string;
  connectOptions?: RdpGraphics;
}

export interface ConnectionPreferenceInfo {
  protocol?: string;
  username?: string;
  accountId?: string;
  accountMode?: "hosted" | "dynamic" | "manual" | "anonymous";
  manualUsername?: string;
  availableProtocols?: string[];
  connectMethod?: string;
  connectOptions?: RdpGraphics;
}

export interface ProtocolConnectionPreferenceInfo {
  connectMethod: string;
}

export interface ConnectMethod {
  name: string;
  display_name: string;
  protocols: string[];
  type: string;
  is_default: boolean;
  is_internal: boolean;
}

export interface RdpGraphics {
  charset?: CharsetType;
  backspaceAsCtrlH?: boolean;
  disableautohash?: boolean;
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
  code?: string;
  detail?: string;
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
  face_token?: string;
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
  language: LanguagePreference;
  collapse: boolean;
  sort: SortType;
  theme: ThemeType;
  themeMode: ThemeType;
  followSystem: boolean;
  layouts: LayoutsType;
  fontFamily: string;
  uiFontSize: number;
  codeFontSize: number;
  primaryColor: string;
  primaryColorLight: string;
  primaryColorDark: string;
  lightThemePreset: ThemePresetId;
  darkThemePreset: ThemePresetId;
  appConfig: AppConfigType | null;
  charset: CharsetType;
  rdpResolution: ResolutionType;
  backspaceAsCtrlH: boolean;
  keyboardLayout: string;
  rdpClientOption: string[];
  rdpColorQuality: string;
  rdpSmartSize: string;
  recentSites: string[];
  sidebarWidth: number;
  sidebarSections: SidebarSectionVisibility;
}
