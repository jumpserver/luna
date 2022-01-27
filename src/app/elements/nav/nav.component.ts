import {Component, Inject, OnInit} from '@angular/core';
import {HttpService, NavService, LogService, ViewService, SettingService} from '@app/services';
import {DataStore} from '@app/globals';
import {CookieService} from 'ngx-cookie-service';
import {ElementLeftBarComponent} from '@app/elements/left-bar/left-bar.component';
import {ElementSettingComponent} from '@app/elements/setting/setting.component';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {Nav, View} from '@app/model';
import {I18nService} from '@app/services/i18n';

@Component({
  selector: 'elements-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.css'],
})
export class ElementNavComponent implements OnInit {
  DataStore = DataStore;
  navs: Array<Nav>;
  viewList: Array<View>;
  HELP_DOCUMENT_URL: string;
  HELP_SUPPORT_URL: string;

  constructor(private _http: HttpService,
              private _logger: LogService,
              private _dialog: MatDialog,
              private _navSvc: NavService,
              private _cookie: CookieService,
              private _i18n: I18nService,
              private _settingSvc: SettingService,
              public _viewSrv: ViewService,
              ) {}

  ngOnInit() {
    this.navs = this.getNav();
    this.viewList = this._viewSrv.viewList;
    this.setHelpUrl();
  }

  click(event) {
    switch (event) {
      case 'ConnectSFTP': {
        window.open('/koko/elfinder/sftp/');
        break;
      }
      case 'HideLeft': {
        ElementLeftBarComponent.Hide();
        this.refreshNav();
        break;
      }
      case 'ShowLeft': {
        ElementLeftBarComponent.Show();
        this.refreshNav();
        break;
      }
      case 'Setting': {
        this.Setting();
        break;
      }
      case 'Copy': {
        // this._appService.copy();
        break;
      }
      case 'FullScreen': {
        const ele: any = document.getElementsByClassName('window active')[0];
        if (!ele) {
          return;
        }
        if (ele.requestFullscreen) {
          ele.requestFullscreen();
        } else if (ele.mozRequestFullScreen) {
          ele.mozRequestFullScreen();
        } else if (ele.msRequestFullscreen) {
          ele.msRequestFullscreen();
        } else if (ele.webkitRequestFullscreen) {
          ele.webkitRequestFullScreen();
        } else {
          throw new Error('不支持全屏api');
        }
        window.dispatchEvent(new Event('resize'));
        break;
      }
      case 'Reconnect': {
        break;
      }
      case 'Disconnect': {
        if (!confirm('断开当前连接? (RDP暂不支持)')) {
          break;
        }
        this._navSvc.disconnectConnection();
        break;
      }
      case'DisconnectAll': {
        if (!confirm('断开所有连接?')) {
          break;
        }
        this._navSvc.disconnectAllConnection();
        break;
      }
      case 'Document': {
        window.open(this.HELP_DOCUMENT_URL);
        break;
      }
      case 'Support': {
        window.open(this.HELP_SUPPORT_URL);
        break;
      }
      case 'English': {
        this._i18n.use('en');
        break;
      }
      case 'Chinese': {
        this._i18n.use('zh');
        break;
      }
      case 'DownLoad': {
        window.open('/core/download/', '_blank');
        break;
      }
      default: {
        break;
      }
    }
  }

  refreshNav() {
    this.navs = this.getNav();
  }

  getNav() {
    return [
      {
      id: 'FileManager',
      name: 'File Manager',
      children: [
        {
          id: 'Connect',
          click: 'ConnectSFTP',
          name: 'Connect'
        },
      ]
    },
      {
      id: 'View',
      name: 'View',
      children: [
        {
          id: 'HideLeftManager',
          click: 'HideLeft',
          name: 'Hide left manager',
          hide: !DataStore.showLeftBar
        },
        {
          id: 'ShowLeftManager',
          click: 'ShowLeft',
          name: 'Show left manager',
          hide: DataStore.showLeftBar
        },
        {
          id: 'SplitVertical',
          href: '',
          name: 'Split vertical',
          disable: true
        },
        {
          id: 'CommandBar',
          href: '',
          name: 'Command bar',
          disable: true
        },
        {
          id: 'ShareSession',
          href: '',
          name: 'Share session (read/write)',
          disable: true
        },
        {
          id: 'FullScreen',
          click: 'FullScreen',
          name: 'Full Screen'
        },
      ]
    },
      {
      id: 'Language',
      name: 'Language',
      children: [
        {
          id: 'English',
          click: 'English',
          name: 'English'
        },
        {
          id: 'Chinese',
          click: 'Chinese',
          name: '中文'
        }
      ]
    },
      {
      id: 'Setting',
      name: 'Setting',
      click: 'Setting',
      children: [
        {
          id: 'Setting',
          click: 'Setting',
          name: 'Setting'
        }
      ]
    },
      {
        id: 'Help',
        name: 'Help',
        children: [
          {
            id: 'Document',
            click: 'Document',
            name: 'Document'
          },
          {
            id: 'Support',
            click: 'Support',
            name: 'Support'
          },
          {
            id: 'Download',
            click: 'DownLoad',
            name: 'Tool download',
          }
        ]
      },
    ];
  }
  Setting() {
    this._dialog.open(
      ElementSettingComponent,
      {
        height: 'auto',
        width: '500px',
      });
  }
  setHelpUrl() {
      this.HELP_DOCUMENT_URL = this._settingSvc.globalSetting.HELP_DOCUMENT_URL;
      this.HELP_SUPPORT_URL = this._settingSvc.globalSetting.HELP_SUPPORT_URL;
  }
}


@Component({
  selector: 'elements-nav-dialog',
  templateUrl: 'changeLanWarning.html',
  styles: ['.mat-form-field { width: 100%; }']
})
export class ChangLanWarningDialogComponent implements OnInit {

  constructor(public dialogRef: MatDialogRef<ChangLanWarningDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any) {
  }

  ngOnInit() {
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}

