/**
 * 控制页面的已连接主机选项卡
 *
 * 展示所有已连接的主机
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {ControlComponent, NavList, View} from '../control.component';
import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'pages-control-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.css'],
})
export class PagesControlNavComponent implements OnInit {
  setActive = PagesControlNavComponent.setActive;
  NavList = NavList;
  pos = {left: '100px', top: '100px'};
  isShowRMenu = false;
  rIdx = -1;


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
    PagesControlNavComponent.setActive(NavList.Active);
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
        // NavList.List[index].Rdp.focus();
      }
    } else {

    }
  }

  constructor() {
  }

  ngOnInit() {
    document.addEventListener('click', this.hideRMenu.bind(this), false);
  }


  close(host, index) {
    if (host.type === 'rdp') {
      ControlComponent.RdpDisconnect(index);
    } else if (host.type === 'ssh') {
      ControlComponent.TerminalDisconnect(index);
    }
    NavList.List.splice(index, 1);
    PagesControlNavComponent.checkActive(index);
  }

  scrollleft() {
    jQuery('.tabs').scrollLeft(jQuery('.tabs').scrollLeft() - 100);
  }

  scrollright() {
    jQuery('.tabs').scrollLeft(jQuery('.tabs').scrollLeft() + 100);
  }

  showRMenu(left, top) {
    this.pos.left = left + 'px';
    this.pos.top = top + 'px';
    this.isShowRMenu = true;
  }

  hideRMenu() {
    this.isShowRMenu = false;
  }

  onRightClick(event, tabIdx) {
    this.showRMenu(event.clientX, event.clientY);
    this.rIdx = tabIdx;
    event.preventDefault();
  }

  rClose() {
    // 关闭当前tab
    this.close(NavList.List[this.rIdx].host, this.rIdx);
  }

  rCloseAll() {
    // 关闭所有tab
    while (NavList.List.length > 1) {
      this.close(NavList.List[0].host, 0);
    }
  }

  rCloseOthers() {
    // 关闭其他tab
    for (let i = NavList.List.length - 2; i > this.rIdx; i--) {
      this.close(NavList.List[i].host, i);
    }
    while (NavList.List.length > 2) {
      this.close(NavList.List[0].host, 0);
    }
  }

  rCloseRight() {
    // 关闭右侧tab
    for (let i = NavList.List.length - 2; i > this.rIdx; i--) {
      this.close(NavList.List[i].host, i);
    }
  }

  rCloseLeft() {
    // 关闭左侧tab
    const keepNum = NavList.List.length - this.rIdx;
    while (NavList.List.length > keepNum) {
      this.close(NavList.List[0].host, 0);
    }
  }

  rCloneConnect() {
    const v = new View();
    const id = this.rIdx + 1;
    const host = NavList.List[this.rIdx].host;
    const user = NavList.List[this.rIdx].user;
    v.nick = host.hostname;
    v.connected = true;
    v.edit = false;
    v.closed = false;
    v.host = host;
    v.user = user;
    v.type = NavList.List[this.rIdx].type;
    NavList.List.splice(id, 0, v);
    NavList.Active = id;
  }
  rReconnect() {
    NavList.List[this.rIdx].termComp.reconnect();
  }
  rDisconnect() {
    if (!confirm('断开当前连接? (RDP暂不支持)')) {
      return;
    }
    switch (NavList.List[NavList.Active].type) {
      case 'ssh': {
        ControlComponent.TerminalDisconnect(NavList.Active);
        break;
      }
      case 'rdp': {
        ControlComponent.RdpDisconnect(NavList.Active);
        break;
      }
      default: {
        // statements;
        break;
      }
    }
  }

}
