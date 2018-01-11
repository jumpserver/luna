/**
 * RDP页面
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {NavList, View, Rdp, ControlComponent} from '../control.component';

import * as Mstsc from 'mstsc.js/client/js/mstsc.js';
// declare let Mstsc: any;

@Component({
  selector: 'app-rdp',
  templateUrl: './rdp.component.html',
  styleUrls: ['./rdp.component.css']
})
export class RdpComponent implements OnInit {
  NavList = NavList;


  static Disconnect(host) {
    host.connected = false;

    // document.getElementById("templatesrc").remove();

  }

  static DisconnectAll() {

  }

  constructor() {
  }

  ngOnInit() {
  }

  Connect(host, username) {
    const id = NavList.List.length - 1;

    const canvas = Mstsc.$('canvas-' + id);
    canvas.style.display = 'inline';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    NavList.List[id].nick = host.name;
    NavList.List[id].connected = true;
    NavList.List[id].edit = false;
    NavList.List[id].closed = false;
    NavList.List[id].type = 'rdp';
    NavList.List[id].Rdp = new Rdp;
    NavList.List[id].Rdp.token = host.token;
    NavList.List[id].Rdp.machine = host.uuid;
    NavList.List[id].Rdp.client = Mstsc.client.create(Mstsc.$('canvas-' + id));
    NavList.List[id].Rdp.client.connect(host.token, '/rdp/socket.io');

    NavList.List.push(new View());
    ControlComponent.active(id);
  }

}
