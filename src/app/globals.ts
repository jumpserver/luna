'use strict';
import {EventEmitter} from 'events/events';
import {BehaviorSubject} from 'rxjs';
import {Browser as _Browser, ConnectEvt, DataStore as _DataStore, Monitor as _Monitor, User as _User, Video as _Video} from './model';

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
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';
export const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000004';
export const ROOT_ORG_ID = '00000000-0000-0000-0000-000000000000';

export const connectEvt = new BehaviorSubject<ConnectEvt>(new ConnectEvt(null, null));

export const resolutionsChoices = ['Auto', '1024x768', '1366x768', '1600x900', '1920x1080'];
