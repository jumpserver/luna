'use strict';
import {EventEmitter} from 'events/events';
import {BehaviorSubject} from 'rxjs';
import {ConnectEvt, ConnectMethod, User as _User} from './model';
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

