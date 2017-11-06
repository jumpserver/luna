import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';
import * as io from 'socket.io-client';
import {Cookie} from 'ng2-cookies/ng2-cookies';

declare let jQuery: any;
declare let Terminal: any;
import {AppService, DataStore} from '../../../app.service';
import {NavList, Term} from '../control.component';


@Component({
  selector: 'app-ssh',
  templateUrl: './ssh.component.html',
  styleUrls: ['./ssh.component.css']
})
export class SshComponent implements OnInit {
  NavList = NavList;

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('SshComponent.ts:SshComponent');
  }

  ngOnInit() {
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


    let id = NavList.term.length - 1;
    NavList.term[id].machine = 'localhost';
    NavList.term[id].nick = 'localhost';
    NavList.term[id].connected = true;
    NavList.term[id].socket = socket;
    NavList.term[id].edit = false;
    NavList.term[id].closed = false;
    NavList.term[id].term = new Terminal({
      cols: cols,
      rows: rows,
      useStyle: true,
      screenKeys: true,
    });
    NavList.term.push(new Term());
    for (let m in NavList.term) {
      NavList.term[m].hide = true;
    }
    NavList.term[id].hide = false;

    NavList.termActive = id;


    // TermStore.term[id]['term'].on('title', function (title) {
    //   document.title = title;
    // });

    NavList.term[id].term.open(document.getElementById('term-' + id), true);

    NavList.term[id].term.write('\x1b[31mWelcome to Jumpserver!\x1b[m\r\n');

    socket.on('connect', function () {
      socket.emit('machine', uuid);

      NavList.term[id].term.on('data', function (data) {
        socket.emit('data', data);
      });


      socket.on('data', function (data) {
        NavList.term[id].term.write(data);
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
          for (let tid in NavList.term) {
            if (NavList.term[tid].connected) {
              NavList.term[tid].socket.emit('resize', [col, row]);
              NavList.term[tid].term.resize(col, row);
            }
          }
          Cookie.set('cols', String(col), 99, '/', document.domain);
          Cookie.set('rows', String(row), 99, '/', document.domain);
        }
      };
    });

  }

  static TerminalDisconnect(i) {
    NavList.term[i].connected = false;
    NavList.term[i].socket.destroy();
    NavList.term[i].term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
  }

  static TerminalDisconnectAll() {
    alert("TerminalDisconnectAll");
    for (let i in NavList.term) {
      SshComponent.TerminalDisconnect(i);
      // TermStore.term[i]["connected"] = false;
      // TermStore.term[i]["socket"].destroy();
      // TermStore.term[i]["term"].write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
    }
  }
}
