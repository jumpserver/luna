/**
 * 控制页面的已连接主机选项卡
 *
 * 展示所有已连接的主机
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {ControlComponent, NavList} from '../control.component';
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
    NavList.List.forEach((value, key) => {
      NavList.List[key].hide = true;
    });
    NavList.List[index].hide = false;
    NavList.Active = index;
    if (!NavList.List[index].edit) {
      if (NavList.List[index].type === 'ssh') {
        NavList.List[index].Term.focus();
      } else if (NavList.List[index].type === 'rdp') {
        NavList.List[index].Rdp.focus();
      }
    } else {

    }
  }

  constructor() {
  }

  ngOnInit() {
  }


  close(host, index) {
    if (host.type === 'rdp') {
      ControlComponent.RdpDisconnect(index);
    } else if (host.type === 'ssh') {
      ControlComponent.TerminalDisconnect(index);
    }
    NavList.List.splice(index, 1);
    ControlnavComponent.checkActive(index);
  }

  scrollleft() {
    jQuery('.tabs').scrollLeft(jQuery('.tabs').scrollLeft() - 100);
  }

  scrollright() {
    jQuery('.tabs').scrollLeft(jQuery('.tabs').scrollLeft() + 100);
  }

}
