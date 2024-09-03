import {Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {View, ViewAction} from '@app/model';
import {ConnectTokenService, HttpService, I18nService, LogService, SettingService, ViewService} from '@app/services';
import {CdkDragDrop, moveItemInArray} from '@angular/cdk/drag-drop';
import {MatDialog} from '@angular/material';
import {ElementCommandDialogComponent} from '@app/elements/content/command-dialog/command-dialog.component';
import {fromEvent, Subscription} from 'rxjs';
import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'elements-content',
  templateUrl: './content.component.html',
  styleUrls: ['./content.component.scss']
})
export class ElementContentComponent implements OnInit, OnDestroy {
  @ViewChild('tabs', {static: false}) tabsRef: ElementRef;
  @Output() toggleMenu: EventEmitter<any> = new EventEmitter<any>();
  viewList: Array<View>;
  batchCommand: string;
  pos = {left: '100px', top: '100px'};
  isShowRMenu = false;
  rIdx = -1;
  sendCommandRange = 'current';
  sendCommandOptions = [
    {
      value: 'all',
      label: 'All sessions'
    },
    {
      value: 'current',
      label: 'Current session'
    }
  ];
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
  isShowInputCommand = true;
  quickCommands = [];
  keyboardSubscription: Subscription;

  constructor(public viewSrv: ViewService,
              public settingSvc: SettingService,
              private _i18n: I18nService,
              private _logger: LogService,
              private _http: HttpService,
              private _dialog: MatDialog,
              private _connectTokenSvc: ConnectTokenService,
  ) {
  }

  get tabsWidth() {
    return this.viewList.length * 201;
  }

  get showBatchCommand() {
    return this.settingSvc.setting.commandExecution
      && this.viewSrv.currentView
      && this.viewSrv.currentView.protocol === 'ssh';
  }

  async ngOnInit() {
    this.viewList = this.viewSrv.viewList;
    this.viewIds = this.viewSrv.viewIds;
    await this.quickCommandsFilter();
    this.handleKeyDownTabChange();
    document.addEventListener('click', this.hideRMenu.bind(this), false);
  }

  ngOnDestroy() {
    this.keyboardSubscription.unsubscribe();
  }

  handleKeyDownTabChange() {
    this.keyboardSubscription = fromEvent(window, 'keydown').subscribe((event: any) => {
      if (event.altKey && event.shiftKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft') && this.viewList.length > 1) {
        let key = '';
        if (event.key === 'ArrowRight') {
          key = 'alt+shift+right';
        } else if (event.key === 'ArrowLeft') {
          key = 'alt+shift+left';
        }
        this.viewSrv.keyboardSwitchTab(key);
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

  sendBatchCommand() {
    let list = this.viewList;
    this.batchCommand = this.batchCommand.trim();
    if (this.batchCommand === '') {
      return;
    }

    const cmd = this.batchCommand + '\r';
    if (this.sendCommandRange === 'current') {
      const view = this.viewList.filter(i => i.id === this.viewSrv.currentView.id);
      list = view;
    }
    for (let i = 0; i < list.length; i++) {
      if (list[i].protocol !== 'ssh' || list[i].connected !== true) {
        continue;
      }
      const subViews = list[i].subViews;
      if (subViews.length > 1) {
        for (let j = 0; j < subViews.length; j++) {
          if (subViews[j].protocol !== 'ssh' || subViews[j].connected !== true) {
            continue;
          }
          subViews[j].termComp.sendCommand({'data': cmd});
        }
      } else {
        list[i].termComp.sendCommand({'data': cmd});
      }
    }

    this.batchCommand = '';
  }

  sendQuickCommand(command) {
    this.batchCommand = command.args;
    this.sendBatchCommand();
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

  async quickCommandsFilter() {
    let list = await this._http.getQuickCommand();
    list = list.filter(i => i.module.value === 'shell');
    this.quickCommands = list;
  }

  async switchCommand() {
    this.batchCommand = '';
    this.isShowInputCommand = !this.isShowInputCommand;
    if (!this.isShowInputCommand) {
      await this.quickCommandsFilter();
    }
  }

  onSendCommand() {
    if (!this.batchCommand) {
      return;
    }

    this._dialog.open(
      ElementCommandDialogComponent,
      {
        height: 'auto',
        width: '500px',
        data: {command: this.batchCommand}
      }
    );
  }

  onScrollLeft() {
    const container: any = document.querySelector('.command-list');
    if (container) {
      container.scrollBy(-container.offsetWidth, 0);
    }
  }

  onScrollRight() {
    const container: any = document.querySelector('.command-list');
    if (container) {
      container.scrollBy(container.offsetWidth, 0);
    }
  }
}
