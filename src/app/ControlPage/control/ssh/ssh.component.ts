/**
 * WebTerminal
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';
import {Cookie} from 'ng2-cookies/ng2-cookies';
import {AppService} from '../../../app.service';
import {NavList, View, Term, ControlComponent} from '../control.component';
import {Terminal} from '../../../globals';
import * as io from 'socket.io-client';
import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'app-ssh',
  templateUrl: './ssh.component.html',
  styleUrls: ['./ssh.component.css']
})
export class SshComponent implements OnInit {
  NavList = NavList;

  static TerminalDisconnect(host) {
    host.connected = false;
    host.Term.socket.destroy();
    host.Term.term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
  }

  static TerminalDisconnectAll() {
    alert('TerminalDisconnectAll');
    for (let i = 0; i < NavList.List.length; i++) {
      SshComponent.TerminalDisconnect(NavList.List[i]);
    }
  }

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('SshComponent.ts:SshComponent');
  }

  ngOnInit() {
  }

  TerminalConnect(host, userid) {
    // console.log(host, userid);
    const socket = io.connect('/ssh');
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


    const id = NavList.List.length - 1;
    NavList.List[id].nick = host.hostname;
    NavList.List[id].connected = true;
    NavList.List[id].edit = false;
    NavList.List[id].closed = false;
    NavList.List[id].type = 'ssh';
    NavList.List[id].Term = new Term;
    NavList.List[id].Term.machine = host.id;
    NavList.List[id].Term.socket = socket;
    NavList.List[id].Term.term = Terminal({
      cols: cols,
      rows: rows,
      useStyle: true,
      screenKeys: true,
    });
    NavList.List.push(new View());
    ControlComponent.active(id);


    // TermStore.term[id]['term'].on('title', function (title) {
    //   document.title = title;
    // });

    NavList.List[id].Term.term.open(document.getElementById('term-' + id), true);

    NavList.List[id].Term.term.write('\x1b[31mWelcome to Jumpserver!\x1b[m\r\n');

    socket.on('connect', function () {
      socket.emit('host', {'uuid': host.id, 'userid': userid});

      NavList.List[id].Term.term.on('data', function (data) {
        socket.emit('data', data);
      });


      socket.on('data', function (data) {
        NavList.List[id].Term.term.write(data);
      });

      socket.on('disconnect', function () {
        SshComponent.TerminalDisconnect(NavList.List[id]);
        // TermStore.term[id]["term"].destroy();
        // TermStore.term[id]["connected"] = false;
      });

      window.onresize = function () {
        let col = Math.floor(jQuery('#term').width() / jQuery('#liuzheng').width() * 8) - 3;
        let row = Math.floor(jQuery('#term').height() / jQuery('#liuzheng').height()) - 5;
        let rows = 24;
        let cols = 80;

        if (Cookie.get('rows')) {
          rows = parseInt(Cookie.get('rows'), 10);
        }
        if (Cookie.get('cols')) {
          cols = parseInt(Cookie.get('cols'), 10);
        }
        if (col < 80) {
          col = 80;
        }
        if (row < 24) {
          row = 24;
        }
        if (cols === col && row === rows) {
        } else {
          for (let _i = 0; _i < NavList.List.length; _i++) {
            if (NavList.List[_i].connected) {
              NavList.List[_i].Term.socket.emit('resize', {'cols': col, 'rows': row});
              NavList.List[_i].Term.term.resize(col, row);
            }
          }
          Cookie.set('cols', String(col), 99, '/', document.domain);
          Cookie.set('rows', String(row), 99, '/', document.domain);
        }
      };
      jQuery(window).resize();
    });

  }


}
