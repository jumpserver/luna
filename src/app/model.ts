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
  groups: Array<UserGroup>;
  logined: boolean;
}

export class Action {
  label: string;
  value: string;
}

export class Account {
  alias: string;
  name: string;
  username: string;
  has_secret: boolean;
  secret: string;
  actions: Array<Action>;
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

class Choice {
  label: string;
  value: string;
}

class SpecInfo {
  db_name?: string;
}

export class Asset {
  id: string;
  name: string;
  address: string;
  comment: string;
  type: Choice;
  category: Choice;
  permed_protocols: Array<Protocol>;
  permed_accounts: Array<Account>;
  spec_info: SpecInfo;
}


export class ConnectEvt {
  action: string;
  node: TreeNode;
  splitConnect?: boolean;

  constructor(node, action: string, splitConnect = false) {
    this.node = node;
    this.action = action;
    this.splitConnect = splitConnect;
  }
}


export class Nav {
  id: string;
  name: string;
  children?: Array<Nav>;
  hide?: boolean = false;
  click?: Function;
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
  name: string;
  connectFrom: string; // connectToken, node, fileManager
  type: string; // database_app, remote_app, asset
  protocol: string;
  active: boolean;
  closed: boolean;
  editable: boolean;
  connected: boolean;
  subViews?: Array<any>;
  asset: Asset;
  account: Account;
  termComp: any;
  connectData: ConnectData;
  connectToken: ConnectionToken;
  connectMethod: ConnectMethod;
  connectOption: Object;
  smartEndpoint: Endpoint;
  iframeElement: Window;

  constructor(asset: Asset, connectInfo: ConnectData, connToken?: ConnectionToken, connectFrom: string = 'node') {
    this.closed = false;
    this.editable = false;
    this.connected = true;
    this.subViews = [];
    this.name = asset.name;
    this.asset = asset;
    this.account = connectInfo.account;
    this.connectFrom = connectFrom;
    this.connectToken = connToken;
    this.connectMethod = connectInfo.connectMethod;
    this.connectOption = connectInfo.connectOption;
    this.protocol = connectInfo.protocol.name;
    this.connectData = connectInfo;
  }

  getConnectOption(field: string) {
    const connectOption = this.connectOption || {};
    return connectOption[field] === undefined ? '' : connectOption[field];
  }

  toString() {
    return this.id;
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

export class ConnectMethod {
  label: string;
  value: string;
  type: string;
  component: string;
  disabled: boolean;
  endpoint_protocol: string;

  constructor(label: string, value: string, type: string, component: string, endpoint_protocol: string = '', disabled: boolean = false) {
    this.label = label;
    this.value = value;
    this.type = type;
    this.component = component;
    this.disabled = disabled;
    this.endpoint_protocol = endpoint_protocol;
  }
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
  HELP_DOCUMENT_URL: string;
  HELP_SUPPORT_URL: string;
  TERMINAL_RAZOR_ENABLED: boolean;
  TERMINAL_MAGNUS_ENABLED: boolean;
  TERMINAL_KOKO_SSH_ENABLED: boolean;
  INTERFACE: any;
  TERMINAL_GRAPHICAL_RESOLUTION: string;
  CONNECTION_TOKEN_REUSABLE: boolean;
  CHAT_AI_ENABLED: boolean;
}

export class Setting {
  commandExecution: boolean = true;
  isSkipAllManualPassword: string = '0';
  sqlClient = '1';

  basic = {
    is_async_asset_tree: false,
    connect_default_open_method: 'new'
  };
  graphics = {
    rdp_resolution: 'Auto',
    keyboard_layout: 'en-us-qwerty',
    rdp_client_option: [],
    applet_connection_method: 'web',
    rdp_smart_size: '0',
    rdp_color_quality: '32'
  };
  command_line = {
    character_terminal_font_size: 14,
    is_backspace_as_ctrl_h: false,
    is_right_click_quickly_paste: false
  };
}


export class Replay {
  id?: string;
  src?: string;
  type?: string;
  status?: string;
  timelist?: Array<number>;
  totalTime?: number;
  json?: any;
  user?: string;
  asset?: string;
  system_user?: string;
  date_start?: string;
  date_end?: string;
  height?: number;
  width?: number;
  download_url?: string;
  account?: string;
}

export class Session {
  asset: string;
  asset_id: string;
  date_start: string;
  login_from_display: string;
  protocol: string;
  remote_addr: string;
  account: string;
  terminal: Terminal;
  user: string;
  user_id: string;
  is_finished: boolean;
  type: {
    label: string;
    value: string;
  };
  is_locked: boolean;
}

export class Terminal {
  id: string;
  name: string;
  type: string;
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

export class AccountGroup {
  name: string;
  disabled: boolean;
  accounts: Account[];
}

export class AuthInfo {
  alias: string;
  username: string;
  secret: string;
  rememberAuth: boolean;
}

export class ConnectOption {
  type: 'checkbox' | 'radio' | 'select';
  field: string;
  hidden: Function;
  label: string;
  value: string | boolean | number;
  options?: any[];
}


export class ConnectData {
  asset: Asset;
  account: Account;
  protocol: Protocol;
  manualAuthInfo: AuthInfo;
  connectMethod: ConnectMethod;
  connectOption: Object;
  downloadRDP: boolean;
  autoLogin: boolean;
}

class FromTicket {
  id: string;
}

class FromTicketInfo {
  check_ticket_api: {
    method: string,
    url: string,
  };
  close_ticket_api: {
    method: string,
    url: string,
  };
  ticket_detail_page_url: string;
  assignees: Array<string>;
}

export class ConnectionToken {
  id: string;
  value: string;
  protocol: string;
  asset: string;
  user?: string;
  account: string;
  expire_time: number;
  is_active: boolean;
  date_expired: Date;
  is_reusable: boolean;
  from_ticket: {
    id: string;
  };
  from_ticket_info: FromTicketInfo;
}

export class Protocol {
  name: string;
  port: number;
  public: boolean;
  setting: any;
}

export class Endpoint {
  host: string;
  https_port: number;
  http_port: number;
  ssh_port: number;
  mysql_port: number;
  mariadb_port: number;
  postgresql_port: number;
  redis_port: number;
  oracle_port: number;

  getHost(): string {
    return this.host || window.location.host;
  }

  getPort(protocol?: string): string {
    let _protocol = protocol || window.location.protocol;
    _protocol = _protocol.replace(':', '');
    let port = this[_protocol + '_port'];
    // 处理 http(s) 协议的后台端口为0的时候, 使用当前地址中的端口
    if (['http', 'https'].indexOf(_protocol) !== -1 && port === 0) {
      port = window.location.port;
    }
    return port;
  }

  getUrl(): string {
    const proto = window.location.protocol;
    let endpoint = this.getHost();
    const port = this.getPort();
    if (port) {
      endpoint = `${endpoint}:${port}`;
    }
    return `${proto}//${endpoint}`;
  }
}

export interface Organization {
  id: string;
  name: string;
  is_root?: boolean;
  is_default?: boolean;
}

export class InitTreeConfig {
  refresh: boolean;
  apiName?: string;
  url?: string;
  setting?: any = {};
  showFavoriteAssets?: boolean = false;
  asyncUrl?: string;
}

export class Ticket {
  id: string;
  title: string;
  type: {
    value: string,
    label: string,
  };
  status: {
    value: string,
    label: string,
  };
}
