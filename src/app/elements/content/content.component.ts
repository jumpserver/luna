import {Component, ElementRef, EventEmitter, OnInit, Output, ViewChild} from '@angular/core';
import {View, ViewAction} from '@app/model';
import {ConnectTokenService, I18nService, LogService, SettingService, ViewService, HttpService} from '@app/services';
import {CdkDragDrop, moveItemInArray} from '@angular/cdk/drag-drop';
import {MatDialog} from '@angular/material';
import {ElementCommandDialogComponent} from '@app/elements/content/command-dialog/command-dialog.component';
import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'elements-content',
  templateUrl: './content.component.html',
  styleUrls: ['./content.component.scss']
})
export class ElementContentComponent implements OnInit {
  @ViewChild('tabs', {static: false}) tabsRef: ElementRef;
  @Output() toggleMenu: EventEmitter<any> = new EventEmitter<any>();
  viewList: Array<View>;
  batchCommand: string;
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
    }
  ];
  viewIds: Array<string> = [];
  isShowInputCommand = true;
  quickCommands = [];

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
    return (this.viewList.length + 1) * 151 + 10;
  }

  get showBatchCommand() {
    return this.settingSvc.setting.commandExecution
      && this.viewSrv.currentView
      && this.viewSrv.currentView.protocol === 'ssh';
  }

  trackByFn(index, item) {
    return item.id;
  }

  async ngOnInit() {
    this.viewList = this.viewSrv.viewList;
    this.viewIds = this.viewSrv.viewIds;
    this.quickCommands = await this._http.getQuickCommand();
    document.addEventListener('click', this.hideRMenu.bind(this), false);
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
    this.tabsRef.nativeElement.scrollLeft -= 150 * 2;
  }

  scrollRight() {
    this.tabsRef.nativeElement.scrollLeft += 150 * 2;
  }

  scrollEnd() {
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

  sendQuickCommand(command) {
    this.batchCommand = command;
    this.sendBatchCommand();
  }

  rMenuItems() {
    return [
      {
        title: 'Clone Connect',
        icon: 'fa-copy',
        callback: () => {
          const id = this.rIdx + 1;
          const oldView = this.viewList[this.rIdx];
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
          this.viewList[this.rIdx].termComp.reconnect();
        }
      },
      {
        title: 'Close Current Tab',
        icon: 'fa-close',
        callback: () => {
          this.closeView(this.viewList[this.rIdx]);
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

  async switchCommand() {
    this.batchCommand = '';
    this.isShowInputCommand = !this.isShowInputCommand;
    if (!this.isShowInputCommand) {
      this.quickCommands = await this._http.getQuickCommand();
    }
  }

  onSendCommand() {
    if (!this.batchCommand) { return; }

    this._dialog.open(
      ElementCommandDialogComponent,
      {
        height: 'auto',
        width: '500px',
        data: {command: this.batchCommand}
      }
    );
  }
}
