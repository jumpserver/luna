import {Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {View, ViewAction} from '@app/model';
import {ConnectTokenService, HttpService, I18nService, LogService, SettingService, ViewService} from '@app/services';
import {CdkDragDrop, moveItemInArray} from '@angular/cdk/drag-drop';
import {fromEvent, Subscription} from 'rxjs';
import * as jQuery from 'jquery/dist/jquery.min.js';
import * as _ from 'lodash';

@Component({
  selector: 'elements-content',
  templateUrl: './content.component.html',
  styleUrls: ['./content.component.scss']
})
export class ElementContentComponent implements OnInit, OnDestroy {
  @ViewChild('tabs', {static: false}) tabsRef: ElementRef;
  @Output() toggleMenu: EventEmitter<any> = new EventEmitter<any>();
  viewList: Array<View>;
  pos = {left: '100px', top: '100px'};
  isShowRMenu = false;
  rIdx = -1;
  systemTips = [
    {
      content: 'Reselect connection method',
      action: 'Right click asset'
    },
    {
      content: 'Expand all asset',
      action: 'Right click node'
    },
    {
      content: 'Asset tree loading method',
      action: 'Settings or basic settings'
    },
    {
      content: 'Download the latest client',
      action: 'Help or download'
    },
    {
      content: 'Keyboard keys',
      action: 'Keyboard switch session'
    }
  ];
  viewIds: Array<string> = [];
  keyboardSubscription: Subscription;

  constructor(public viewSrv: ViewService,
              public settingSvc: SettingService,
              private _i18n: I18nService,
              private _logger: LogService,
              private _http: HttpService,
              private _connectTokenSvc: ConnectTokenService,
  ) {
  }

  get showBatchCommand() {
    return true;
    // return this.settingSvc.setting.commandExecution
    //   && this.viewSrv.currentView
    //   && this.viewSrv.currentView.protocol === 'ssh';
  }

  get tabsWidth() {
    return this.viewList.length * 201;
  }

  onToggleMobileLayout() {
  }

  async ngOnInit() {
    this.viewList = this.viewSrv.viewList;
    this.viewIds = this.viewSrv.viewIds;
    this.handleKeyDownTabChange();
    document.addEventListener('click', this.hideRMenu.bind(this), false);
  }

  ngOnDestroy() {
    this.keyboardSubscription.unsubscribe();
  }

  handleKeyDownTabChange() {
    const debouncedSwitch = _.debounce((key: string) => {
      this.viewSrv.keyboardSwitchTab(key);
    }, 500);

    this.keyboardSubscription = fromEvent(window, 'keydown').subscribe((event: any) => {
      if (event.altKey && event.shiftKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft') && this.viewList.length > 1) {
        let key = '';
        if (event.key === 'ArrowRight') {
          key = 'alt+shift+right';
        } else if (event.key === 'ArrowLeft') {
          key = 'alt+shift+left';
        }
        debouncedSwitch(key);
      }
    });
  }

  onNewView(view) {
    this.scrollEnd();
    this.toggleMenu.emit();
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
    this.tabsRef.nativeElement.scrollLeft -= 200 * 2;
  }

  scrollRight() {
    this.tabsRef.nativeElement.scrollLeft += 200 * 2;
  }

  scrollEnd() {
    this.tabsRef.nativeElement.scrollLeft = this.tabsRef.nativeElement.scrollWidth;
  }

  trackByFn(index, item) {
    return item.id;
  }

  rMenuItems() {
    return [
      {
        title: 'Clone Connect',
        icon: 'fa-copy',
        callback: () => {
          const id = this.rIdx + 1;
          const oldId = this.viewIds[this.rIdx];
          const oldView = this.viewList.find(i => i.id === oldId);
          const oldConnectToken = oldView.connectToken;
          this._connectTokenSvc.exchange(oldConnectToken).then((newConnectToken) => {
            const newView = new View(oldView.asset, oldView.connectData, newConnectToken);
            this.viewSrv.addView(newView);
            this.setViewActive(newView);
          });
        }
      },
      {
        title: 'Reconnect',
        icon: 'fa-refresh',
        callback: () => {
          const viewId = this.viewIds[this.rIdx];
          const currentView = this.viewList.find(i => i.id === viewId);
          currentView.termComp.reconnect();
        }
      },
      {
        title: 'Split vertically',
        icon: 'fa-columns',
        callback: () => {
          const oldView = this.viewList[this.rIdx];
          this._connectTokenSvc.exchange(oldView.connectToken).then((newConnectToken) => {
            const newView = new View(oldView.asset, oldView.connectData, newConnectToken);
            this.viewSrv.addSubViewToCurrentView(newView);
          });
        },
        disabled: this.viewList[this.rIdx].subViews.length > 0
      },
      {
        title: 'Close Current Tab',
        icon: 'fa-close',
        callback: () => {
          const viewId = this.viewIds[this.rIdx];
          const currentView = this.viewList.find(i => i.id === viewId);
          this.closeView(currentView);
        }
      },
      {
        title: 'Close All Tabs',
        icon: '',
        disabled: this.viewList.length === 0,
        callback: () => {
          while (this.viewList.length > 0) {
            this.closeView(this.viewList[0]);
          }
        },
      },
      {
        title: 'Close Other Tabs',
        icon: '',
        disabled: this.viewList.length <= 1,
        callback: () => {
          for (let i = this.viewList.length - 1; i > this.rIdx; i--) {
            this.closeView(this.viewList[i]);
          }
          while (this.viewList.length > 1) {
            this.closeView(this.viewList[0]);
          }
        },
      },
      {
        title: 'Close Left Tabs',
        icon: '',
        callback: () => {
          const keepNum = this.viewList.length - this.rIdx;
          while (this.viewList.length > keepNum) {
            this.closeView(this.viewList[0]);
          }
        },
        disabled: this.rIdx === 0
      },
      {
        title: 'Close Right Tabs',
        icon: '',
        callback: () => {
          for (let i = this.viewList.length - 1; i > this.rIdx; i--) {
            this.closeView(this.viewList[i].asset);
          }
        },
        disabled: this.rIdx === this.viewList.length - 1
      }
    ];
  }

  showRMenu(left, top) {
    this.pos.left = left + 'px';
    this.pos.top = top + 'px';
    this.isShowRMenu = true;
  }

  hideRMenu() {
    this.isShowRMenu = false;
  }

  getViewById(id) {
    return this.viewList.find((view) => {
      return view.id === id;
    });
  }

  onRightClick(event, tabIdx) {
    const sideX = jQuery('#left-side').width();
    const x = event.pageX - sideX;
    const y = event.pageY - 30;
    this.showRMenu(x, y);
    this.rIdx = tabIdx;
    event.preventDefault();
  }

  onItemDropped(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.viewIds, event.previousIndex, event.currentIndex);
  }

}
