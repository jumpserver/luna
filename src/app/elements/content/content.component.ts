import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {View, ViewAction} from './model';

@Component({
  selector: 'elements-content',
  templateUrl: './content.component.html',
  styleUrls: ['./content.component.scss']
})
export class ElementContentComponent implements OnInit {
  viewList: Array<View> = [];
  @ViewChild('tabs') tabsRef: ElementRef;

  static DisconnectAll() {
  }

  get tabsWidth() {
    return (this.viewList.length + 1) * 151 + 10;
  }

  constructor() {
  }

  ngOnInit() {
  }

  onNewView(view) {
    this.scrollToEnd();
    setTimeout(() => {
      this.viewList.push(view);
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
    this.tabsRef.nativeElement.scrollLeft -= 150 * 2;
  }

  scrollRight() {
    this.tabsRef.nativeElement.scrollLeft += 150 * 2;
  }

  scrollToEnd() {
    this.tabsRef.nativeElement.scrollLeft = this.tabsRef.nativeElement.scrollWidth;
  }

}
