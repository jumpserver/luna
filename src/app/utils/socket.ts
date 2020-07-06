import {EventEmitter} from 'events/events';
import {Conn, NSConn, marshal} from 'neffos.js';
import * as neffos from 'neffos.js';


export class Socket {
  conn: Conn;
  nsConn: NSConn;
  emitter: EventEmitter;
  url: string;
  namespace: string;

  constructor(url: string, namespace: string) {
    this.url = url;
    this.namespace = namespace;
  }

  async connect() {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    this.emitter = emitter;
    const events = {
    };
    let interval = null;

    events[this.namespace] = {
      _OnNamespaceConnected: (ns, msg) => {
        emitter.emit('connect', ns);
        if (ns.conn.wasReconnected()) {
          this.conn = ns.conn;
          this.nsConn = ns;
          console.log('Ws was reconnected');
        }
        interval = setInterval(() => ns.emit('ping', ''), 10000);
      },

      _OnNamespaceDisconnect: function (ns, msg) {
        emitter.emit('disconnect', ns);
        if (interval) {
          clearInterval(interval);
        }
      },

      _OnAnyEvent: function (ns, msg) {
        let data = '';
        if (msg.Body) {
          data = msg.unmarshal();
        }
        emitter.emit(msg.Event, data);
      },
    };
    const options = {
      reconnect: 5000,
      headers: {
        'X-Namespace': 'ssh'
      },
    };
    this.conn = <Conn>await neffos.dial(this.url, events, options)
      .catch(err => {
        console.log('connect to neffos ws error: ', err);
        return null;
    });
    if (!this.conn) {
      return null;
    }
    this.nsConn = <NSConn> await this.conn.connect(this.namespace)
      .catch(err => {
        console.log('connect to namespace error: ', err);
        return null;
      });
    return this.nsConn;
  }

  emit(type: string, obj: any) {
    const msg = marshal(obj);
    this.nsConn.emit(type, msg);
  }

  on(type: string, fn: Function, opt_scope?: any, opt_oneshot?: boolean) {
    this.emitter.on(type, fn, opt_scope, opt_oneshot);
  }
  off(type: string, fn: Function) {
    this.emitter.off(type, fn);
  }
}

