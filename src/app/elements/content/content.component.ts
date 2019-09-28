import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {View, ViewAction} from '@app/model';
import {ViewService} from '@app/services';

@Component({
  selector: 'elements-content',
  templateUrl: './content.component.html',
  styleUrls: ['./content.component.scss']
})
export class ElementContentComponent implements OnInit {
  @ViewChild('tabs') tabsRef: ElementRef;
  viewList: Array<View>;
  batchCommand: string;

  static DisconnectAll() {
  }

  get tabsWidth() {
    return (this.viewList.length + 1) * 151 + 10;
  }

  constructor(private viewSrv: ViewService) {
  }

  ngOnInit() {
    this.viewList = this.viewSrv.viewList;
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
      if (this.viewList[i].type !== 'ssh' || this.viewList[i].connected !== true) {
        continue;
      }
      const d = {'data': cmd, 'room': this.viewList[i].room};

      this.viewList[i].termComp.ws.emit('data', d);
    }

    this.batchCommand = '';

  }

}
