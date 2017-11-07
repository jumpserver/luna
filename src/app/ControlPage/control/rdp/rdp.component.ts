/**
 * RDP页面
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {NavList, View, Rdp} from '../control.component';

declare let jQuery: any;

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
    NavList.List[id].nick = host.name;
    NavList.List[id].connected = true;
    NavList.List[id].edit = false;
    NavList.List[id].closed = false;
    NavList.List[id].type = "rdp";
    NavList.List[id].Rdp = new Rdp;
    NavList.List[id].Rdp.token = "xxx";
    NavList.List[id].Rdp.machine = "xxx";

    NavList.List.push(new View());
    for (let m in NavList.List) {
      NavList.List[m].hide = true;
    }
    NavList.List[id].hide = false;

    NavList.Active = id;
    jQuery("#rdp-" + id + " iframe")[0].contentWindow.focus();

  }

  static Disconnect(host) {
    host.connected = false;
    // document.getElementById("templatesrc").remove();

  }

}
