'use strict';
import {EventEmitter} from 'events/events';
import {BehaviorSubject} from 'rxjs';
import {ConnectEvt, ConnectType, User as _User} from './model';
import {DataStore as _DataStore, Browser as _Browser, Video as _Video, Monitor as _Monitor} from './model';

export let TermWS = null;
export const emitter = new (EventEmitter);
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

export const connectEvt = new BehaviorSubject<ConnectEvt>(new ConnectEvt(null, null));

export const TYPE_WEB_CLI: ConnectType = {
  name: 'Web CLI',
  id: 'webCLI',
  requireXPack: false
};

export const TYPE_WEB_GUI: ConnectType = {
  name: 'Web GUI',
  id: 'webGUI',
  requireXPack: false
};

export const TYPE_DB_GUI: ConnectType = {
  name: 'Web GUI',
  id: 'dbGUI',
  requireXPack: true
};

export const TYPE_RDP_CLIENT: ConnectType = {
  name: 'RDP Client',
  id: 'rdpClient',
  requireXPack: true
};

export const TYPE_RDP_FILE: ConnectType = {
  name: 'RDP File',
  id: 'rdpFile',
  requireXPack: true
};

export const ProtocolConnectTypes = {
  ssh: [TYPE_WEB_CLI],
  rdp: [TYPE_WEB_GUI, TYPE_RDP_CLIENT, TYPE_RDP_FILE],
  vnc: [TYPE_WEB_GUI],
  telnet: [TYPE_WEB_CLI],
  mysql: [TYPE_WEB_CLI, TYPE_DB_GUI],
  sqlserver: [TYPE_WEB_CLI],
  postgresql: [TYPE_DB_GUI],
  oracle: [TYPE_DB_GUI],
  mariadb: [TYPE_WEB_CLI, TYPE_DB_GUI],
  k8s: [TYPE_WEB_CLI],
};
