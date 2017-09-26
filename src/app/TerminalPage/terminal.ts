import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';
import * as io from 'socket.io-client';
import {Cookie} from 'ng2-cookies/ng2-cookies';

declare let jQuery: any;
declare let Terminal: any;

import {AppService, DataStore, Term} from '../app.service';


@Component({
  selector: 'term-body',
  templateUrl: './terminal.html',
  styleUrls: ['./terminal.css'],
  // directives: [NgClass]
})


export class TerminalComponent implements OnInit {
  DataStore = DataStore;

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('TermComponent.ts:TermComponent');
  }

  ngOnInit() {
    //DataStore.term[0]["term"].open(document.getElementById("term-0"))
    this.timer();
  }

  ngAfterViewInit() {
    // this._appService.TerminalConnect({});
    //this._logger.debug("term width ", jQuery("#term").width());
    //this._logger.debug("term height", jQuery("#term").height());
  }

  timer() {
    if (DataStore.termlist.length > 0) {
      for (let i in DataStore.termlist) {
        this.TerminalConnect(DataStore.termlist[i]);
      }
      DataStore.termlist = []
    }
    jQuery(window).trigger('resize');
    setTimeout(() => {
      this.timer()
    }, 0)
  }

  close(i) {
    this._logger.debug(i);
    Terminal.TerminalDisconnect(i);
    DataStore.term[i].hide = true;
    DataStore.term[i].closed = true;
    DataStore.term[i].term.destroy();
    DataStore.term.splice(i, 1);
    Terminal.checkActive(i);
  }

  static checkActive(index) {
    let len = DataStore.term.length;
    if (len == 2) {
      // 唯一一个
      DataStore.termActive = 0;
    } else {
      if (len - 1 == index) {
        // 删了最后一个
        DataStore.termActive = index - 1;
      } else {
        DataStore.termActive = index;
      }
      for (let m in DataStore.term) {
        DataStore.term[m].hide = true;
      }
      DataStore.term[DataStore.termActive].hide = false;
    }
  }

  setActive(index) {
    for (let m in DataStore.term) {
      DataStore.term[m].hide = true;
    }
    DataStore.term[index].hide = false;
    DataStore.termActive = index;
  }

  dblclick() {
    console.log(DataStore.term)
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


    let id = DataStore.term.length - 1;
    DataStore.term[id].machine = 'localhost';
    DataStore.term[id].nick = 'localhost';
    DataStore.term[id].connected = true;
    DataStore.term[id].socket = socket;
    DataStore.term[id].edit = false;
    DataStore.term[id].closed = false;
    DataStore.term[id].term = new Terminal({
      cols: cols,
      rows: rows,
      useStyle: true,
      screenKeys: true
    });
    DataStore.term.push(new Term());
    for (let m in DataStore.term) {
      DataStore.term[m].hide = true;
    }
    DataStore.term[id].hide = false;

    this._logger.log(DataStore.term[id + 1].closed);
    DataStore.termActive = id;


    // DataStore.term[id]['term'].on('title', function (title) {
    //   document.title = title;
    // });

    DataStore.term[id].term.open(document.getElementById('term-' + id));

    DataStore.term[id].term.write('\x1b[31mWelcome to Jumpserver!\x1b[m\r\n');

    socket.on('connect', function () {
      socket.emit('machine', uuid);

      DataStore.term[id].term.on('data', function (data) {
        socket.emit('data', data);
      });


      socket.on('data', function (data) {
        DataStore.term[id].term.write(data);
      });

      socket.on('disconnect', function () {
        this.TerminalDisconnect(id);
        // DataStore.term[id]["term"].destroy();
        // DataStore.term[id]["connected"] = false;
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
          for (let tid in DataStore.term) {
            if (DataStore.term[tid].connected) {
              DataStore.term[tid].socket.emit('resize', [col, row]);
              DataStore.term[tid].term.resize(col, row);
            }
          }
          Cookie.set('cols', String(col), 99, '/', document.domain);
          Cookie.set('rows', String(row), 99, '/', document.domain);
        }
      };
    });

  }

  static TerminalDisconnect(i) {
    DataStore.term[i].connected = false;
    DataStore.term[i].socket.destroy();
    DataStore.term[i].term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
  }

  static TerminalDisconnectAll() {
    alert("TerminalDisconnectAll");
    for (let i in DataStore.term) {
      Terminal.TerminalDisconnect(i);
      // DataStore.term[i]["connected"] = false;
      // DataStore.term[i]["socket"].destroy();
      // DataStore.term[i]["term"].write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
    }
  }
}
