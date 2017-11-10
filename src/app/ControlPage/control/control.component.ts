/**
 * 控制页面
 *
 * 主管已连接的主机标签卡，各连接方式的web展现（WebTerminal、RDP、VNC等）
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';

export class Term {
  machine: string;
  socket: any;
  term: any;
}

export class Rdp {
  machine: string;
  token: string;
  client: any;
}

export class View {
  nick: string;
  type: string;
  edit: boolean;
  connected: boolean;
  hide: boolean;
  closed: boolean;
  Rdp: Rdp;
  Term: Term;

}

export let NavList: {
  List: Array<View>;
  Active: number;
} = {
  List: [new View()],
  Active: 0,
};

@Component({
  selector: 'app-control',
  templateUrl: './control.component.html',
  styleUrls: ['./control.component.css']
})
export class ControlComponent implements OnInit {

  constructor() {
  }

  ngOnInit() {
  }

}
