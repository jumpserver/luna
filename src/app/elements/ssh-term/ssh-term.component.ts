import {AfterViewInit, Component, Input, OnInit } from '@angular/core';
import {Terminal} from 'xterm';
import {NavList} from '../../pages/control/control/control.component';
import {UUIDService} from '../../app.service';
import {TermWS} from '../../globals';

const ws = TermWS;

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
      fontFamily: '"Monaco", "Consolas", "monospace"',
      fontSize: 14,
      rightClickSelectsWord: true,
      theme: {
        background: '#1f1b1b'
      }
    });
  }

  ngAfterViewInit() {
    this.joinRoom();
  }

  changeWinSize(size: Array<number>) {
    ws.emit('resize', {'cols': size[0], 'rows': size[1]});
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
      const view = NavList.List[that.index];
      if (view && data['room'] === view.room) {
        that.term.write(data['data']);
      }
    });

    ws.on('disconnect', () => {
      that.disconnect();
    });

    ws.on('logout', (data) => {
      if (data['room'] === NavList.List[that.index].room) {
        NavList.List[that.index].connected = false;
      }
    });

    ws.on('room', data => {
      if (data['secret'] === this.secret) {
        NavList.List[that.index].room = data['room'];
      }
    });
  }

  disconnect() {
    const view = NavList.List[this.index];
    if (view) {
      NavList.List[this.index].connected = false;
      ws.emit('logout', NavList.List[this.index].room);
    }
  }

  active() {
    this.term.focus();
  }
}
