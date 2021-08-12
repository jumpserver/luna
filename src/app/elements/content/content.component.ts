import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {View, ViewAction} from '@app/model';
import {SettingService, ViewService} from '@app/services';
import * as jQuery from 'jquery/dist/jquery.min.js';
import * as _ from 'lodash';

@Component({
  selector: 'elements-content',
  templateUrl: './content.component.html',
  styleUrls: ['./content.component.scss']
})
export class ElementContentComponent implements OnInit {
  @ViewChild('tabs', {static: false}) tabsRef: ElementRef;
  viewList: Array<View>;
  batchCommand: string;
  pos = {left: '100px', top: '100px'};
  isShowRMenu = false;
  rIdx = -1;

  static DisconnectAll() {
  }

  get tabsWidth() {
    return (this.viewList.length + 1) * 151 + 10;
  }

  constructor(private viewSrv: ViewService,
              public settingSvc: SettingService
  ) {
  }

  ngOnInit() {
    this.viewList = this.viewSrv.viewList;
    document.addEventListener('click', this.hideRMenu.bind(this), false);
  }

  onNewView(view) {
    this.scrollToEnd();
    setTimeout(() => {
      this.viewSrv.addView(view);
      this.setViewActive(view);
    }, 100);
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
    this.viewSrv.activeView(view);
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
    this.viewSrv.removeView(view);
    if (nextActiveView) {
      this.setViewActive(nextActiveView);
    }
  }

  scrollLeft() {
    this.tabsRef.nativeElement.scrollLeft -= 150 * 2;
  }

  scrollRight() {
    this.tabsRef.nativeElement.scrollLeft += 150 * 2;
  }

  scrollToEnd() {
    this.tabsRef.nativeElement.scrollLeft = this.tabsRef.nativeElement.scrollWidth;
  }

  sendBatchCommand() {
    this.batchCommand = this.batchCommand.trim();
    if (this.batchCommand === '') {
      return;
    }

    const cmd = this.batchCommand + '\r';
    for (let i = 0; i < this.viewList.length; i++) {
      if (this.viewList[i].protocol !== 'ssh' || this.viewList[i].connected !== true) {
        continue;
      }
      const d = {'data': cmd};

      this.viewList[i].termComp.sendCommand(d);
    }

    this.batchCommand = '';
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
    const sideX = jQuery('#left-side').width();
    const x = event.pageX - sideX;
    const y = event.pageY - 30;
    this.showRMenu(x, y);
    this.rIdx = tabIdx;
    event.preventDefault();
  }

  rClose() {
    // 关闭当前tab
    this.closeView(this.viewList[this.rIdx]);
  }

  rCloseAll() {
    // 关闭所有tab
    while (this.viewList.length > 0) {
      this.closeView(this.viewList[0]);
    }
  }

  rCloseOthers() {
    // 关闭其他tab
    for (let i = this.viewList.length - 1; i > this.rIdx; i--) {
      this.closeView(this.viewList[i]);
    }
    while (this.viewList.length > 1) {
      this.closeView(this.viewList[0]);
    }
  }

  rCloseRight() {
    // 关闭右侧tab
    for (let i = this.viewList.length - 1; i > this.rIdx; i--) {
      this.closeView(this.viewList[i].node);
    }
  }

  rCloseLeft() {
    // 关闭左侧tab
    const keepNum = this.viewList.length - this.rIdx;
    while (this.viewList.length > keepNum) {
      this.closeView(this.viewList[0]);
    }
  }

  rCloneConnect() {
    const id = this.rIdx + 1;
    const v = _.cloneDeep(this.viewList[this.rIdx]);
    this.viewList.splice(id, 0, v);
    this.setViewActive(v);
  }
  rReconnect() {
    this.viewList[this.rIdx].termComp.reconnect();
  }

}
