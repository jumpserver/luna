import {Component, OnInit, HostListener, OnDestroy} from '@angular/core';
import {View} from '@app/model';
import {HttpService, I18nService, LogService, SettingService, ViewService} from '@app/services';
import {
  ElementSendCommandWithVariableDialogComponent
} from '@app/elements/content/content-footer/send-command-with-variable-dialog/send-command-with-variable-dialog.component';
import {ElementCommandDialogComponent} from '@app/elements/content/command-dialog/command-dialog.component';
import {NzModalService} from 'ng-zorro-antd/modal';
import {languages} from '@codemirror/language-data';
import {Subscription} from 'rxjs';

@Component({
  standalone: false,
  selector: 'elements-content-footer',
  templateUrl: 'content-footer.component.html',
  styleUrls: ['content-footer.component.scss'],
})
export class ElementContentFooterComponent implements OnInit, OnDestroy {
  viewList: Array<View> = [];
  isShowInputCommand = true;
  batchCommand: string = '';
  quickCommands = [];
  filterCommands = [];
  sendCommandToAll = false;
  showCommandZone = false;
  editorOption = {
    language: 'shell',
    languages: languages,
    theme: 'dark',
    lineNumbers: false,
    setup: 'minimal',
    autoFocus: true
  };
  searchText: string = '';
  connectViewCount = 0;
  private viewListSub: Subscription;

  constructor(public viewSrv: ViewService,
              public settingSvc: SettingService,
              protected _i18n: I18nService,
              private _dialog: NzModalService,
              private _logger: LogService,
              private _http: HttpService,
  ) {
  }

  get showBatchCommand() {
    return (
      this.settingSvc.setting.commandExecution
    );
  }

  async ngOnInit() {
    this.viewList = this.viewSrv.viewList;
    this.viewListSub = this.viewSrv.connectViewCount$.subscribe(count => {
      this.connectViewCount = count;
    });
    this.batchCommand = '';
    await this.quickCommandsFilter();
  }

  sendBatchCommand() {
    let list = this.viewList;
    this.batchCommand = this.batchCommand.trim();
    if (this.batchCommand === '') {
      return;
    }

    const cmd = this.batchCommand + '\r';
    if (!this.sendCommandToAll) {
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
    if (command.variable.length > 0) {
      const dialogRef = this._dialog.create({
        nzTitle: this._i18n.instant('Send command'),
        nzContent: ElementSendCommandWithVariableDialogComponent,
        nzWidth: '500px',
        nzFooter: null,
        nzData: {
          command: command
        }
      });
      dialogRef.afterClose.subscribe(result => {
        if (result) {
          this.batchCommand = result;
        }
      });
    } else {
      this.batchCommand = command.args;
    }

  }

  onSaveCommand() {
    if (!this.batchCommand) {
      return;
    }

    const dialogRef = this._dialog.create(
      {
        nzTitle: this._i18n.instant('Save command'),
        nzContent: ElementCommandDialogComponent,
        nzData: {
          command: this.batchCommand
        },
        nzFooter: null,
      }
    );
    dialogRef.afterClose.subscribe(async result => {
      if (result) {
        await this.quickCommandsFilter();
      }
    });
  }

  searchCommand(event: string) {
    const value = event.toLowerCase();
    this.filterCommands = this.quickCommands.filter(item => {
        return item.name.toLowerCase().includes(value) || item.args.toLowerCase().includes(value);
      }
    );
  }

  async quickCommandsFilter() {
    let list = await this._http.getQuickCommand();
    list = list.filter(i => i.module.value === 'shell');
    this.quickCommands = list;
    this.filterCommands = list;
  }

  async switchCommand() {
    this.batchCommand = '';
    this.isShowInputCommand = !this.isShowInputCommand;
    if (!this.isShowInputCommand) {
      await this.quickCommandsFilter();
    }
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

  async ngOnDestroy() {
    this.viewListSub?.unsubscribe();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key.toLowerCase() === 'enter') {
      event.preventDefault(); // 阻止默认保存行为
      this.sendBatchCommand();
    }
  }
}
