'use strict';
import * as terminal from 'xterm/dist/xterm';
import * as io from 'socket.io-client';

export function Terminal(xargs: any) {
  return terminal(xargs);
}

export const TermWS = io.connect('/ssh');
export let term: {
  term: any;
  col: number;
  row: number;
} = {
  term: Terminal({
    cols: 80,
    rows: 24,
    useStyle: true,
    screenKeys: true,
  }),
  col: 80,
  row: 24,
};
export const sep = '/';
export let Video: {
  id: string,
  src: string,
  type: string,
  json: object;
  timelist: Array<number>;
  totalTime: number;
} = {
  id: 'sss',
  src: 'sss',
  type: 'json',
  json: {},
  timelist: [],
  totalTime: 0,
};

export let Monitor: {
  token: string,
  room: string,
  type: string,
} = {
  token: '',
  room: '',
  type: 'term',
};

export class Group {
  id: string;
  name: string;
  membercount: number;
  comment: string;
}

export let User: {
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
  groups: Array<Group>;
  logined: boolean;
} = {
  id: '',
  name: 'nobody',
  username: '',
  password: '',
  phone: '',
  avatar: '',
  role: '',
  email: '',
  wechat: '',
  comment: '',
  is_active: false,
  is_superuser: false,
  date_joined: '',
  last_login: '',
  date_expired: '',
  groups: [],
  logined: false,
};

export let DataStore: {
  socket: any;
  Nav: Array<{}>;
  NavShow: boolean;
  Path: {};
  error: {};
  msg: {};
  loglevel: number;
  leftbarshow: boolean;
  windowsize: Array<number>;
  autologin: boolean;
  guacamole_token: string;
} = {
  socket: io.connect(),
  Nav: [{}],
  NavShow: true,
  Path: {},
  error: {},
  msg: {},
  loglevel: 0,
  leftbarshow: true,
  windowsize: [],
  autologin: false,
  guacamole_token: ''
};
export let CSRF = '';

export let Browser: {
  userAgent: string;
  appCodeName: string;
  appName: string;
  appVersion: string;
  language: string;
  platform: string;
  product: string;
  productSub: string;
  vendor: string;
} = {
  userAgent: navigator.userAgent,
  appCodeName: navigator.appCodeName,
  appName: navigator.appName,
  appVersion: navigator.appVersion,
  language: navigator.language,
  platform: navigator.platform,
  product: navigator.product,
  productSub: navigator.productSub,
  vendor: navigator.vendor,
};

export let wsEvent: {
  event: string;
  data: any;
};

export const i18n = new Map();

