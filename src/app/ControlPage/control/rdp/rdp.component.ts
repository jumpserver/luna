/**
 * RDP页面
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {NavList, View, Rdp} from '../control.component';

declare let Mstsc: any;

@Component({
  selector: 'app-rdp',
  templateUrl: './rdp.component.html',
  styleUrls: ['./rdp.component.css']
})
export class RdpComponent implements OnInit {
  NavList = NavList;

  constructor() {
  }

  ngOnInit() {
  }

  Connect(host) {
    let id = NavList.List.length - 1;

    let canvas = Mstsc.$("canvas-" + id);
    canvas.style.display = 'inline';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    NavList.List[id].nick = host.name;
    NavList.List[id].connected = true;
    NavList.List[id].edit = false;
    NavList.List[id].closed = false;
    NavList.List[id].type = "rdp";
    NavList.List[id].Rdp = new Rdp;
    NavList.List[id].Rdp.token = host.token;
    NavList.List[id].Rdp.machine = host.machine;
    NavList.List[id].Rdp.client = Mstsc.client.create(Mstsc.$("canvas-" + id));
    NavList.List[id].Rdp.client.connect(host.token, "rdp/socket.io");


    NavList.List.push(new View());
    for (let m in NavList.List) {
      NavList.List[m].hide = true;
    }
    NavList.List[id].hide = false;

    NavList.Active = id;

  }

  static Disconnect(host) {
    host.connected = false;

    // document.getElementById("templatesrc").remove();

  }

}
