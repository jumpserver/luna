import {Component, Input, OnInit, OnDestroy } from '@angular/core';
import {Terminal} from 'xterm';
import {View} from '@app/model';
import {LogService, UUIDService} from '@app/app.service';
import {Socket} from '@app/utils/socket';
import {getWsSocket, translate} from '@app/globals';


@Component({
  selector: 'elements-ssh-term',
  templateUrl: './ssh-term.component.html',
  styleUrls: ['./ssh-term.component.scss']
})
export class ElementSshTermComponent implements OnInit, OnDestroy {
  @Input() host: any;
  @Input() view: View;
  @Input() sysUser: any;
  @Input() index: number;
  @Input() token: string;

  term: Terminal;
  secret: string;
  ws: Socket;
  roomID: string;

  constructor(private _uuid: UUIDService, private _logger: LogService) {
  }

  ngOnInit() {
    this.secret = this._uuid.gen();
    this.newTerm();
    getWsSocket().then(sock => {
      this.ws = sock;
      this.connectHost();
    });
    this.view.type = 'ssh';
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

  reconnect() {
    if (this.view.connected === true) {
      if (!confirm(translate('Are you sure to reconnect it?(RDP not support)'))) {
        return;
      }
    }
    this.secret = this._uuid.gen();
    this.emitHostAndTokenData();
  }

  emitHostAndTokenData() {
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
      this._logger.debug('On token event trigger');
      this.ws.emit('token', data);
    }
  }

  connectHost() {
    this.emitHostAndTokenData();

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
      this._logger.debug('On disconnect event trigger');
      this.view.connected = false;
    });

    this.ws.on('logout', data => {
      if (data.room === this.roomID) {
        this._logger.debug('On logout event trigger: ', data.room, this.roomID);
        this.view.connected = false;
      }
    });

    this.ws.on('room', data => {
      if (data.secret === this.secret && data.room) {
        this._logger.debug('On room', data);
        this.roomID = data.room;
        this.view.room = data.room;
        this.view.connected = true;
      }
    });
  }

  active() {
    this.term.focus();
  }

  ngOnDestroy(): void {
    this._logger.debug('Close view');
    if (this.view && (this.view.room === this.roomID)) {
      this.view.connected = false;
      this.ws.emit('logout', this.roomID);
    }
  }
}
