/**
 * 控制页面
 *
 * 主管已连接的主机标签卡，各连接方式的web展现（WebTerminal、RDP、VNC等）
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {TermWS} from '../../globals';
import {View, ViewAction} from './model';
import jQuery from 'jquery/dist/jquery.min';

@Component({
  selector: 'elements-content',
  templateUrl: './content.component.html',
  styleUrls: ['./content.component.css']
})
export class ElementContentComponent implements OnInit {
  viewList: Array<View> = [];

  static RdpDisconnect(id) {
    // viewList.List[id].connected = false;
  }

  static DisconnectAll() {
    // for (let i = 0; i < viewList.List.length; i++) {
    //   // Todo:
    //   // ContentComponent.TerminalDisconnect(i);
    // }
  }

  constructor() {
  }

  ngOnInit() {
  }

  onNewView(view) {
    this.viewList.push(view);
    this.setViewActive(view);
  }

  onViewAction(action: ViewAction) {
    switch (action.name) {
      case 'active': {
        this.setViewActive(action.view);
        break;
      }
      case 'close': {
        this.closeView(action.view);
        break;
      }
    }
  }

  setViewActive(view) {
    this.viewList.forEach((v, k) => {
        v.active = v === view;
    });
  }

  closeView(view) {
    let nextActiveView = null;
    const index = this.viewList.indexOf(view);
    if (view.active) {
      // 如果关掉的是最后一个, 存在上一个
      if (index === this.viewList.length - 1 && index !== 0) {
        nextActiveView = this.viewList[index - 1];
      } else if (index < this.viewList.length) {
        nextActiveView = this.viewList[index + 1];
      }
    }
    this.viewList.splice(index, 1);
    if (nextActiveView) {
      this.setViewActive(nextActiveView);
    }
  }

  scrollLeft() {
    const tabRef = jQuery('.tabs');
    tabRef.scrollLeft(tabRef.scrollLeft() - 100);
  }

  scrollRight() {
    const tabRef = jQuery('.tabs');
    tabRef.scrollLeft(tabRef.scrollLeft() + 100);
  }

}
