import {AfterViewInit, Component, Input, OnInit, OnDestroy } from '@angular/core';
import {Terminal} from 'xterm';
import {NavList, View} from '../../pages/control/control/control.component';
import {UUIDService} from '../../app.service';
import {CookieService} from 'ngx-cookie-service';
import {Socket} from '../../utils/socket';
import {getWsSocket} from '../../globals';


@Component({
  selector: 'elements-ssh-term',
  templateUrl: './ssh-term.component.html',
  styleUrls: ['./ssh-term.component.scss']
})
export class ElementSshTermComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() host: any;
  @Input() sysUser: any;
  @Input() index: number;
  @Input() token: string;

  term: Terminal;
  secret: string;
  ws: Socket;
  roomID: string;
  view: View;

  constructor(private _uuid: UUIDService, private _cookie: CookieService) {
  }

  ngOnInit() {
    this.view = NavList.List[this.index];
    this.secret = this._uuid.gen();
    this.newTerm();
    getWsSocket().then(sock => {
      this.ws = sock;
      this.connectHost();
    });
  }

  ngAfterViewInit() {
  }

  newTerm() {
    const fontSize = localStorage.getItem('fontSize') || '14';
    this.term = new Terminal({
      fontFamily: 'monaco, Consolas, "Lucida Console", monospace',
      fontSize: parseInt(fontSize, 10),
      rightClickSelectsWord: true,
      theme: {
        background: '#1f1b1b'
      }
    });
    this.view.Term = this.term;
  }

  changeWinSize(size: Array<number>) {
    if (this.ws) {
      this.ws.emit('resize', {'cols': size[0], 'rows': size[1]});
    }
  }

  connectHost() {
    if (this.host) {
      const data = {
        uuid: this.host.id,
        userid: this.sysUser.id,
        secret: this.secret,
        size: [this.term.cols, this.term.rows]
      };
      this.ws.emit('host', data);
    }
    if (this.token) {
      const data = {
        'token': this.token, 'secret': this.secret,
        'size': [this.term.cols, this.term.rows]
      };
      console.log('On token event trigger');
      this.ws.emit('token', data);
    }

    this.term.on('data', data => {
      const d = {'data': data, 'room': this.roomID};
      this.ws.emit('data', d);
    });

    this.ws.on('data', data => {
      if (data.room === this.roomID) {
        this.term.write(data['data']);
      }
    });

    // 服务器主动断开
    this.ws.on('disconnect', () => {
      console.log('On disconnect event trigger');
      this.close();
    });

    this.ws.on('logout', data => {
      if (data.room === this.roomID) {
        console.log('On logout event trigger: ', data.room, this.roomID);
        this.view.connected = false;
      }
    });

    this.ws.on('room', data => {
      if (data.secret === this.secret && data.room) {
        console.log('On room', data);
        this.roomID = data.room;
        this.view.room = data.room;
      }
    });
  }

  // 客户端主动关闭
  close() {
    if (this.view && (this.view.room === this.roomID)) {
      this.view.connected = false;
      this.ws.emit('logout', this.roomID);
    }
  }

  active() {
    this.term.focus();
  }

  ngOnDestroy(): void {
    this.close();
  }
}
