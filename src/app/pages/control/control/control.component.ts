/**
 * 控制页面
 *
 * 主管已连接的主机标签卡，各连接方式的web展现（WebTerminal、RDP、VNC等）
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {TermWS} from '../../../globals';
import * as jQuery from 'jquery/dist/jquery.min';
import {ElementSshTermComponent} from '../../../elements/ssh-term/ssh-term.component';

export class View {
  nick: string;
  type: string;
  edit: boolean;
  connected: boolean;
  hide: boolean;
  closed: boolean;
  host: any;
  user: any;
  remoteApp: string;
  room: string;
  Rdp: any;
  Term: any;
  termComp: ElementSshTermComponent;
}

export let NavList: {
  List: Array<View>;
  Active: number;
} = {
  List: [new View()],
  Active: 0,
};

@Component({
  selector: 'pages-control-control',
  templateUrl: './control.component.html',
  styleUrls: ['./control.component.css']
})
export class ControlComponent implements OnInit {
  NavList = NavList;
  batchCommand: string;

  static active(id) {
    NavList.List.forEach((v, k) => {
      v.hide = id.toString() !== k;
    });
    NavList.Active = id;
    jQuery('.tabs').animate({'scrollLeft': 150 * id}, 400);
  }

  static TerminalDisconnect(id) {
    if (NavList.List[id].connected) {
      NavList.List[id].connected = false;
      NavList.List[id].Term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
      TermWS.emit('logout', NavList.List[id].room);
    }
  }

  static SendCommandToAllSshTerm(cmd) {
    for (let i = 0; i < NavList.List.length; i++) {
      if (NavList.List[i].type !== 'ssh' || NavList.List[i].connected !== true) {
        continue;
      }
      const d = {'data': cmd, 'room': NavList.List[i].room};
      TermWS.emit('data', d);
    }
  }

  static RdpDisconnect(id) {
    NavList.List[id].connected = false;
  }

  static DisconnectAll() {
    for (let i = 0; i < NavList.List.length; i++) {
      ControlComponent.TerminalDisconnect(i);
    }
  }

  constructor() {
  }

  ngOnInit() {
  }

  sendBatchCommand() {
    this.batchCommand = this.batchCommand.trim();
    if (this.batchCommand === '') {
      return;
    }
    ControlComponent.SendCommandToAllSshTerm(this.batchCommand + '\r');
    this.batchCommand = '';

  }
}
