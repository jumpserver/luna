import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';
import * as io from 'socket.io-client';
import {Cookie} from 'ng2-cookies/ng2-cookies';

declare let jQuery: any;
declare let Terminal: any;

import {AppService, DataStore} from '../app.service';

export class Term {
  nick: string;
  edit: boolean;
  machine: string;
  connected: boolean;
  closed: boolean;
  socket: any;
  term: any;
  hide: boolean;
}

export let TermStore: {
  term: Array<Term>;
  termlist: Array<string>;
  termActive: number;


} = {
  term: [new Term()],
  termlist: [],
  termActive: 0,
};

@Component({
  selector: 'term-body',
  templateUrl: './terminal.html',
  styleUrls: ['./terminal.css'],
  // directives: [NgClass]
})


export class TerminalComponent implements OnInit {
  DataStore = DataStore;
  TermStore = TermStore;

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('TermComponent.ts:TermComponent');
  }

  ngOnInit() {
    //TermStore.term[0]["term"].open(document.getElementById("term-0"))
    this.timer();
  }

  ngAfterViewInit() {
    // this._appService.TerminalConnect({});
    //this._logger.debug("term width ", jQuery("#term").width());
    //this._logger.debug("term height", jQuery("#term").height());
  }

  timer() {
    if (TermStore.termlist.length > 0) {
      for (let i in TermStore.termlist) {
        this.TerminalConnect(TermStore.termlist[i]);
      }
      TermStore.termlist = []
    }
    jQuery(window).trigger('resize');
    setTimeout(() => {
      this.timer()
    }, 0)
  }

  close(i) {
    this._logger.debug(i);
    TerminalComponent.TerminalDisconnect(i);
    TermStore.term[i].hide = true;
    TermStore.term[i].closed = true;
    TermStore.term[i].term.destroy();
    TermStore.term.splice(i, 1);
    TerminalComponent.checkActive(i);
  }

  static checkActive(index) {
    let len = TermStore.term.length;
    if (len == 1) {
      // 唯一一个
      TermStore.termActive = 0;
    } else if (len - 1 == index) {
      // 删了最后一个
      TermStore.termActive = len - 2;
    } else {
      TermStore.termActive = index;
    }
    TerminalComponent.setActive(TermStore.termActive)
  }

  setActive = TerminalComponent.setActive;

  static setActive(index) {
    for (let m in TermStore.term) {
      TermStore.term[m].hide = true;
    }
    TermStore.term[index].hide = false;
    TermStore.termActive = index;
  }

  dblclick() {
    console.log(TermStore.term)
  }

  TerminalConnect(uuid) {
    let socket = io.connect();
    let cols = '80';
    let rows = '24';
    if (Cookie.get('cols')) {
      cols = Cookie.get('cols');
    }
    if (Cookie.get('rows')) {
      rows = Cookie.get('rows');
    }
    Cookie.set('cols', cols, 99, '/', document.domain);
    Cookie.set('rows', rows, 99, '/', document.domain);


    let id = TermStore.term.length - 1;
    TermStore.term[id].machine = 'localhost';
    TermStore.term[id].nick = 'localhost';
    TermStore.term[id].connected = true;
    TermStore.term[id].socket = socket;
    TermStore.term[id].edit = false;
    TermStore.term[id].closed = false;
    TermStore.term[id].term = new Terminal({
      cols: cols,
      rows: rows,
      useStyle: true,
      screenKeys: true,
    });
    TermStore.term.push(new Term());
    for (let m in TermStore.term) {
      TermStore.term[m].hide = true;
    }
    TermStore.term[id].hide = false;

    TermStore.termActive = id;


    // TermStore.term[id]['term'].on('title', function (title) {
    //   document.title = title;
    // });

    TermStore.term[id].term.open(document.getElementById('term-' + id), true);

    TermStore.term[id].term.write('\x1b[31mWelcome to Jumpserver!\x1b[m\r\n');

    socket.on('connect', function () {
      socket.emit('machine', uuid);

      TermStore.term[id].term.on('data', function (data) {
        socket.emit('data', data);
      });


      socket.on('data', function (data) {
        TermStore.term[id].term.write(data);
      });

      socket.on('disconnect', function () {
        this.TerminalDisconnect(id);
        // TermStore.term[id]["term"].destroy();
        // TermStore.term[id]["connected"] = false;
      });

      window.onresize = function () {
        let col = Math.floor(jQuery('#term').width() / jQuery('#liuzheng').width() * 8) - 3;
        let row = Math.floor(jQuery('#term').height() / jQuery('#liuzheng').height()) - 5;
        let rows = 24;
        let cols = 80;

        if (Cookie.get('rows')) {
          rows = parseInt(Cookie.get('rows'));
        }
        if (Cookie.get('cols')) {
          cols = parseInt(Cookie.get('cols'));
        }
        if (col < 80) col = 80;
        if (row < 24) row = 24;
        if (cols == col && row == rows) {
        } else {
          for (let tid in TermStore.term) {
            if (TermStore.term[tid].connected) {
              TermStore.term[tid].socket.emit('resize', [col, row]);
              TermStore.term[tid].term.resize(col, row);
            }
          }
          Cookie.set('cols', String(col), 99, '/', document.domain);
          Cookie.set('rows', String(row), 99, '/', document.domain);
        }
      };
    });

  }

  static TerminalDisconnect(i) {
    TermStore.term[i].connected = false;
    TermStore.term[i].socket.destroy();
    TermStore.term[i].term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
  }

  static TerminalDisconnectAll() {
    alert("TerminalDisconnectAll");
    for (let i in TermStore.term) {
      TerminalComponent.TerminalDisconnect(i);
      // TermStore.term[i]["connected"] = false;
      // TermStore.term[i]["socket"].destroy();
      // TermStore.term[i]["term"].write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
    }
  }
}
