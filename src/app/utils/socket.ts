import {EventEmitter} from 'events/events';
import {NSConn, marshal} from 'neffos.js';
import * as neffos from 'neffos.js';


export class Socket {
  conn: NSConn;
  emitter: EventEmitter;

  constructor(conn: NSConn, emitter: EventEmitter) {
    this.conn = conn;
    this.emitter = emitter;
  }

  emit(type: string, obj: any) {
    const msg = marshal(obj);
    this.conn.emit(type, msg);
  }

  on(type: string, fn: Function, opt_scope?: any, opt_oneshot?: boolean) {
    this.emitter.on(type, fn, opt_scope, opt_oneshot);
  }
}


export async function getWsSock(url: string, namespace: string): Promise<Socket> {
  const emitter = new EventEmitter();
  const events = {
  };
  let interval;

  events[namespace] = {
    _OnNamespaceConnected: function (ns, msg) {
      emitter.emit('connect', ns);
      interval = setInterval(() => ns.emit('ping', ''), 10000);
    },

    _OnNamespaceDisconnect: function (ns, msg) {
      emitter.emit('disconnect', ns);
      if (interval) {
        clearInterval(interval);
      }
    },

    _OnRoomJoined: function (ns, msg) {
      emitter.emit('roomJoined', msg.Room);
    },

    _OnRoomLeft: function (ns, msg) {
      emitter.emit('roomLeft', msg.Room);
    },

    _OnAnyEvent: function (ns, msg) {
      emitter.emit(msg.Event, msg);
    },
  };
  const options = {
    reconnect: 5000,
  };
  const conn = <neffos.Conn>await neffos.dial(url, events, options);
  const nsConn = <neffos.NSConn>await conn.connect(namespace);
  const sock = new Socket(nsConn, emitter);
  return sock;
}
