'use strict';
import {EventEmitter} from 'events/events';
import {Socket} from './utils/socket';
import {BehaviorSubject} from 'rxjs';
import {ConnectEvt, User as _User } from './model';
import {DataStore as _DataStore, Browser as _Browser, Video as _Video, Monitor as _Monitor} from './model';

const scheme = document.location.protocol === 'https:' ? 'wss' : 'ws';
const port = document.location.port ? ':' + document.location.port : '';
const hostname = document.location.hostname;
const wsURL = `${scheme}://${hostname}${port}/koko/ws/`;
export let TermWS = null;

export const emitter = new(EventEmitter);
export const sep = '/';
export let Video = new _Video();
export let Monitor = new _Monitor();
export let User = new _User();
export const DataStore: _DataStore = {
  socket: TermWS,
  Nav: [{}],
  NavShow: true,
  Path: {},
  error: {},
  msg: {},
  logLevel: 4,
  showLeftBar: true,
  windowSize: [],
  autoLogin: false,
  guacamoleToken: '',
  guacamoleTokenTime: 0,
  termSelection: ''
};

export let Browser = new _Browser();
export const i18n = new Map();

export async function getWsSocket() {
  if (TermWS) {
    return TermWS;
  }
  TermWS = new Socket(wsURL, 'ssh');
  const nsConn = await TermWS.connect();
  if (!nsConn) {
    console.log('Try to using socket.io protocol');
  }
  DataStore.socket = TermWS;
  return TermWS;
}

export const connectEvt = new BehaviorSubject<ConnectEvt>(new ConnectEvt(null, null));

export function translate(value) {
   if (i18n.has(value.toLowerCase())) {
      return i18n.get(value.toLowerCase());
   } else {
      return value;
   }
}

