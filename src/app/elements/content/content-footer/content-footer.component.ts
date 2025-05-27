import {Component, OnInit,} from '@angular/core';
import {View} from '@app/model';
import {HttpService, I18nService, LogService, SettingService, ViewService} from '@app/services';
import {
  ElementSendCommandWithVariableDialogComponent
} from '@app/elements/content/send-command-with-variable-dialog/send-command-with-variable-dialog.component';
import {ElementCommandDialogComponent} from '@app/elements/content/command-dialog/command-dialog.component';
import {NzModalService} from 'ng-zorro-antd';


@Component({
  selector: 'elements-content-footer',
  templateUrl: './content-footer.component.html',
  styleUrls: ['./content-footer.component.scss'],
})
export class ElementContentFooterComponent implements OnInit {
  viewList: Array<View> = [];
  isShowInputCommand = true;
  batchCommand: string = '';
  quickCommands = [];
  sendCommandRange = 'current';
  sendCommandToAll = false;
  showCommandZone = false;
  codeEditorOptions = {
    language: 'shell',
    theme: 'dark',
    lineNumbers: false,
    minimap: {enabled: false},
  };
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

  constructor(public viewSrv: ViewService,
              public settingSvc: SettingService,
              private _i18n: I18nService,
              private _dialog: NzModalService,
              private _logger: LogService,
              private _http: HttpService,
  ) {
  }

  async ngOnInit() {
    this.viewList = this.viewSrv.viewList;
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
    if (command.variable.length > 0) {
      const dialogRef = this._dialog.create({
        nzTitle: this._i18n.instant('Send command'),
        nzContent: ElementSendCommandWithVariableDialogComponent,
        nzWidth: '500px',
        nzComponentParams: {
          command: command
        }
      });
      dialogRef.afterClose.subscribe(result => {
        if (result) {
          this.batchCommand = result;
          this.sendBatchCommand();
        }
      });
    } else {
      this.sendBatchCommand();
    }

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

    this._dialog.create(
      {
        nzTitle: this._i18n.instant('Send command'),
        nzContent: ElementCommandDialogComponent,
        nzWidth: '500px',
        nzComponentParams: {
          data: {command: this.batchCommand}
        }
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
