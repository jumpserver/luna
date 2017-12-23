'use strict';
import * as io from 'socket.io-client';

export const sep = '/';
export const version = '22.22.2';
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
  is_active: boolean;
  date_joined: string;
  last_login: string;
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
  is_active: false,
  date_joined: '',
  last_login: '',
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
};
export let CSRF: string = '';

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

export class wsEvent {
  event: string;
  data: any;
}
