import {AfterViewInit, Component, Input, OnInit, OnDestroy } from '@angular/core';
import {Terminal} from 'xterm';
import * as neffos from 'neffos.js';
import {NavList} from '../../pages/control/control/control.component';
import {UUIDService} from '../../app.service';
import {CookieService} from 'ngx-cookie-service';
import {Socket, Room} from '../../utils/socket';
import {getWsSocket} from '../../globals';


@Component({
  selector: 'elements-ssh-term',
  templateUrl: './ssh-term.component.html',
  styleUrls: ['./ssh-term.component.scss']
})
export class ElementSshTermComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() host: any;
  @Input() userid: any;
  @Input() index: number;
  @Input() token: string;

  term: Terminal;
  secret: string;
  ws: Socket;
  room: Room;

  constructor(private _uuid: UUIDService, private _cookie: CookieService) {
  }

  ngOnInit() {
    this.secret = this._uuid.gen();
    getWsSocket().then(sock => {
      this.ws = sock;
      console.log('Connect ok');
      console.log(this.ws);
      this.joinRoom();
    });
    const fontSize = localStorage.getItem('fontSize') || '14';
    this.term = new Terminal({
      fontFamily: 'monaco, Consolas, "Lucida Console", monospace',
      fontSize: parseInt(fontSize, 10),
      rightClickSelectsWord: true,
      theme: {
        background: '#1f1b1b'
      }
    });
  }

  ngAfterViewInit() {
  }

  changeWinSize(size: Array<number>) {
    if (this.ws) {
      this.ws.emit('resize', {'cols': size[0], 'rows': size[1]});
    }
  }

  joinRoom() {
    NavList.List[this.index].Term = this.term;
    if (this.host) {
      const data = {
        uuid: this.host.id,
        userid: this.userid,
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
      this.ws.emit('token', data);
    }
    const that = this;

    this.term.on('data', data => {
      const d = {'data': data};
      this.room.emit('data', d);
    });

    this.ws.on('data', (roomName, msg) => {
      const data = msg.unmarshal();
      const view = NavList.List[that.index];
      if (view && roomName === view.room) {
        that.term.write(data['data']);
      }
    });

    this.ws.on('disconnect', () => {
      that.close();
    });

    this.ws.on('logout', (roomName, msg) => {
      const data = msg.unmarshal();
      if (data.room === NavList.List[that.index].room) {
        NavList.List[that.index].connected = false;
      }
    });

    this.ws.on('room', (roomName, msg) => {
      const data = msg.unmarshal();
      console.log('On room', roomName, data);
      if (data.secret === this.secret && data.room) {
        this.ws.JoinRoom(data.room).then(room => {
          this.room = room;
        });
        NavList.List[that.index].room = data.room;
      }
    });
  }

  close() {
    const view = NavList.List[this.index];
    if (view) {
      NavList.List[this.index].connected = false;
      console.log(NavList.List[this.index].room);
      this.room.emit('logout', {'room': NavList.List[this.index].room});
    }
  }

  active() {
    this.term.focus();
  }

  ngOnDestroy(): void {
    this.close();
  }
}
