export class UserGroup {
  id: string;
  name: string;
  comment: string;
}

export class User {
  id: string;
  name: string;
  username: string;
  password: string;
  phone: string;
  avatar: string;
  role: string;
  email: string;
  wechat: string;
  comment: string;
  is_active: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string;
  date_expired: string;
  groups: Array <UserGroup>;
  logined: boolean;
}

export class SystemUser {
  id: string;
  name: string;
  login_mode: string;
  username: string;
  priority: number;
  protocol: string;
  password: string;
  actions: Array<string>;
  username_same_with_user: boolean;
}

class TreeNodeMeta {
  type: string;
  data: any;
}

export class TreeNode {
  id: string;
  name: string;
  comment: string;
  title: string;
  isParent: boolean;
  pId: string;
  open: boolean;
  iconSkin: string;
  meta: TreeNodeMeta;
}

export class Node {
  id: string;
  key: string;
  value: string;
}

export class Asset {
  id: string;
  hostname: string;
  ip: string;
  comment: string;
  domain: string;
  os: string;
  platform: string;
  protocols: Array<string>;
}


export class ConnectEvt {
  node: TreeNode;
  action: string;

  constructor(node: TreeNode, action: string) {
    this.node = node;
    this.action = action;
  }
}


export class Nav {
  id: string;
  name: string;
  children?: Array<Nav>;
  hide?: boolean = false;
  click?: string;
  href?: string;
  disable?: boolean = false;

}

export class NavEvt {
  name: string;
  value: any;

  constructor(name: string, value: any) {
    this.name = name;
    this.value = value;
  }
}

export class View {
  id: string;
  nick: string;
  connectFrom: string; // token, node, fileManager
  type: string; // database_app, remote_app, asset, k8s_app
  protocol: string;
  editable: boolean;
  active: boolean;
  connected: boolean;
  hide: boolean;
  closed: boolean;
  node: TreeNode;
  sysUser: SystemUser;
  // remoteApp: string;
  // room: string;
  // Rdp: any;
  // Term: any;
  token: string;
  connectType: ConnectType;
  termComp: any;

  constructor(node: TreeNode, user: SystemUser, connectFrom: string, type: string, protocol: string) {
    this.connected = true;
    this.editable = false;
    this.closed = false;
    this.nick = node.name;
    this.node = node;
    this.sysUser = user;
    this.connectFrom = connectFrom;
    this.type = type;
    this.protocol = protocol;
  }
}

export class ViewAction {
  view: View;
  name: string;

  constructor(view: View, name: string) {
    this.view = view;
    this.name = name;
  }
}

export class ConnectType {
  name: string;
  id: string;
  requireXPack: boolean;
}

export class DataStore {
  socket: any;
  Nav: Array<object>;
  NavShow = true;
  Path: {};
  error: {};
  msg: {};
  logLevel: number;
  showLeftBar = true;
  windowSize: Array<number>;
  autoLogin: boolean;
  guacamoleToken: string;
  guacamoleTokenTime: number;
  termSelection: string;
}

export class Browser {
  userAgent: string;
  appCodeName: string;
  appName: string;
  appVersion: string;
  language: string;
  platform: string;
  product: string;
  productSub: string;
  vendor: string;

  constructor() {
    this.userAgent = navigator.userAgent;
    this.appCodeName = navigator.appCodeName;
    this.appName = navigator.appName;
    this.appVersion = navigator.appVersion;
    this.language = navigator.language;
    this.platform = navigator.platform;
    this.product = navigator.product;
    this.productSub = navigator.productSub;
    this.vendor = navigator.vendor;
  }
}

export class Video {
  id: string;
  src: string;
  type: string;
  height: number;
  width: number;
  json: object;
  timeList: Array<number>;
  totalTime: number;
}

export class Monitor {
  token: string;
  room: string;
  type: string;
}

export class GlobalSetting {
  WINDOWS_SKIP_ALL_MANUAL_PASSWORD: boolean;
  SECURITY_MAX_IDLE_TIME: number;
  XPACK_LICENSE_IS_VALID: boolean;
  SECURITY_COMMAND_EXECUTION: boolean;
  SECURITY_LUNA_REMEMBER_AUTH: boolean;
  SECURITY_WATERMARK_ENABLED: boolean;
  XRDP_ENABLED: boolean;
  HELP_DOCUMENT_URL: string;
  HELP_SUPPORT_URL: string;
}

export class Setting {
  rdpResolution: string = 'Auto';
  rdpFullScreen: number = 0;
  rdpDrivesRedirect: number = 0;
  fontSize: number = 14;
  isLoadTreeAsync: string = '1';
  isSkipAllManualPassword: string = '0';
  quickPaste = '0';
  sqlClient = '1';
  commandExecution: boolean = true;
}


export class Replay {
  id: string;
  src: string;
  type: string;
  status: string;
  timelist: Array<number>;
  totalTime: number;
  json: any;
  user: string;
  asset: string;
  system_user: string;
  date_start: string;
  date_end: string;
  height: number;
  width: number;
  download_url: string;
}

export class Session {
  asset: string;
  asset_id: string;
  date_start: string;
  login_from_display: String;
  protocol: string;
  remote_addr: string;
  system_user: string;
  system_user_id: string;
  terminal: string;
  user: string;
  user_id: string;
}

export class Command {
  id: string;
  user: string;
  asset: string;
  system_user: string;
  input: string;
  output: string;
  session: string;
  risk_level: number;
  risk_level_display: string;
  org_id: string;
  timestamp: number;
}

export class SystemUserGroup {
  name: string;
  disabled: boolean;
  systemUsers: SystemUser[];
}

export class AuthInfo {
  username: string;
  password: string;
}

export class ConnectData {
  node: TreeNode;
  systemUser: SystemUser;
  manualAuthInfo: AuthInfo;
  connectType: ConnectType;
}
