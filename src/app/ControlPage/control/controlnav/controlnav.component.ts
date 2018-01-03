/**
 * 控制页面的已连接主机选项卡
 *
 * 展示所有已连接的主机
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {NavList} from '../control.component';
import {SshComponent} from '../ssh/ssh.component';
import {RdpComponent} from '../rdp/rdp.component';
import * as jQuery from 'jquery/dist/jquery.min.js';


@Component({
  selector: 'app-controlnav',
  templateUrl: './controlnav.component.html',
  styleUrls: ['./controlnav.component.css'],
})
export class ControlnavComponent implements OnInit {
  setActive = ControlnavComponent.setActive;
  NavList = NavList;

  static checkActive(index) {
    const len = NavList.List.length;
    if (len === 1) {
      // 唯一一个
      NavList.Active = 0;
    } else if (len - 1 === index) {
      // 删了最后一个
      NavList.Active = len - 2;
    } else {
      NavList.Active = index;
    }
    ControlnavComponent.setActive(NavList.Active);
  }

  static setActive(index) {
    for (let m in NavList.List) {
      NavList.List[m].hide = true;
    }
    NavList.List[index].hide = false;
    NavList.Active = index;
    if (NavList.List[index].type === 'ssh') {
      jQuery('app-ssh').show();
      jQuery('app-rdp').hide();
    } else if (NavList.List[index].type === 'rdp') {
      jQuery('app-ssh').hide();
      jQuery('app-rdp').show();
    }
  }

  constructor() {
  }

  ngOnInit() {
  }


  close(host, index) {
    if (host.type === 'rdp') {
      RdpComponent.Disconnect(host);
    } else if (host.type === 'ssh') {
      SshComponent.TerminalDisconnect(host);
    }
    NavList.List.splice(index, 1);
    ControlnavComponent.checkActive(index);
  }

}
