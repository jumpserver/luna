
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
  meta: any;
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

export class GuacObjAddResp {
  code: number;
  result: string;
}

export class ConnectEvt {
  node: TreeNode;
  action: string;

  constructor(node: TreeNode, action: string) {
    this.node = node;
    this.action = action;
  }
}

export class DataStore {
  socket: any;
  Nav: Array<object>;
  NavShow = true;
  Path: {};
  error: {};
  msg: {};
  loglevel: number;
  showLeftBar = true;
  windowsize: Array<number>;
  autologin: boolean;
  guacamoleToken: string;
  guacamoleTokenTime: number;

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
  timelist: Array<number>;
  totalTime: number;
}

export class Monitor {
  token: string;
  room: string;
  type: string;
}

