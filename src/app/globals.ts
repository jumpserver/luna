'use strict';
import {EventEmitter} from 'events/events';
import * as io from 'socket.io-client';
import * as neffos from 'neffos.js';
import {Terminal} from 'xterm';
// const abc = io.connect('/ssh');
import {Socket} from './utils/socket';

const scheme = document.location.protocol === 'https:' ? 'wss' : 'ws';
const port = document.location.port ? ':' + document.location.port : '';
const wsURL = scheme + '://' + document.location.hostname + port + '/socket.io/';
export let TermWS = null;

export const emitter = new(EventEmitter);
export const sep = '/';
export let Video: {
  id: string,
  src: string,
  type: string,
  height: number,
  width: number,
  json: object;
  timelist: Array<number>;
  totalTime: number;
} = {
  id: '',
  src: '',
  type: '',
  width: 0,
  height: 0,
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
  guacamole_token_time: number;
  termSelection: string;
} = {
  socket: TermWS,
  Nav: [{}],
  NavShow: true,
  Path: {},
  error: {},
  msg: {},
  loglevel: 0,
  leftbarshow: true,
  windowsize: [],
  autologin: false,
  guacamole_token: '',
  guacamole_token_time: 0,
  termSelection: '',
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

export const i18n = new Map();

export async function getWsSocket() {
  if (TermWS) {
    return TermWS;
  }
  TermWS = new Socket(wsURL, 'ssh');
  const nsConn = await TermWS.connect();
  if (!nsConn) {
    console.log('Try to using socket.io protocol');
    TermWS = io.connect('/ssh', {reconnectionAttempts: 10});
  }
  DataStore.socket = TermWS;
  return TermWS;
}


