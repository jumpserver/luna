import {AfterViewInit, Component, Input, OnInit } from '@angular/core';
import * as io from 'socket.io-client';
// import {ws} from '../../globals';
import * as Terminal from 'xterm/dist/xterm';
import {NavList} from '../../pages/control/control/control.component';
import {UUIDService} from '../../app.service';

const ws = io.connect('/ssh');

@Component({
  selector: 'elements-ssh-term',
  templateUrl: './ssh-term.component.html',
  styleUrls: ['./ssh-term.component.scss']
})
export class ElementSshTermComponent implements OnInit, AfterViewInit {
  @Input() host: any;
  @Input() userid: any;
  @Input() index: number;
  @Input() token: string;

  term: Terminal;
  secret: string;

  constructor(private _uuid: UUIDService) {
  }

  ngOnInit() {
    this.secret = this._uuid.gen();
    this.term = new Terminal({
      // cols: 80,
      // rows: 24,
      useStyle: true,
      screenKeys: true,
    });
  }

  ngAfterViewInit() {
    this.joinRoom();
  }

  joinRoom() {
    NavList.List[this.index].Term = this.term;
    if (this.host) {
      ws.emit('host', {'uuid': this.host.id, 'userid': this.userid, 'secret': this.secret});
    }
    if (this.token) {
      ws.emit('token', {'token': this.token, 'secret': this.secret});
    }
    const that = this;

    this.term.on('data', function (data) {
      ws.emit('data', {'data': data, 'room': NavList.List[that.index].room});
    });

    ws.on('data', data => {
      if (data['room'] === NavList.List[that.index].room) {
        that.term.write(data['data']);
      }
    });

    ws.on('disconnect', () => {
      that.disconnect();
    });
    ws.on('logout', (data) => {
      if (data['room'] === NavList.List[that.index].room) {
        NavList.List[that.index].connected = false;
        // this.term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
      }
    });
    ws.on('room', data => {
      console.log('Compile secret: ', data['secret'], this.secret);
      if (data['secret'] === this.secret) {
        console.log('Set room: ', data['room']);
        NavList.List[that.index].room = data['room'];
        console.log('get', that.index, 'room: ', NavList.List[that.index].room);
      }
    });
  }

  disconnect() {
    NavList.List[this.index].connected = false;
    // this.term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
    ws.emit('logout', NavList.List[this.index].room);
  }

  active() {
    this.term.focus();
  }
}
