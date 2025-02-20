import {Component, Inject, OnInit} from '@angular/core';
import {HttpService, LogService, NavService, SettingService, ViewService} from '@app/services';
import {DataStore} from '@app/globals';
import {CookieService} from 'ngx-cookie-service';
import {ElementSettingComponent} from '@app/elements/setting/setting.component';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {Nav, View} from '@app/model';
import {I18nService} from '@app/services/i18n';
import {useTheme} from '@app/utils/useTheme';

@Component({
  selector: 'elements-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss'],
})
export class ElementNavComponent implements OnInit {
  DataStore = DataStore;
  navs: Array<Nav>;
  viewList: Array<View>;
  viewIds: Array<string>;
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
  ) {
  }

  get viewListSorted() {
    const viewList = [];
    this.viewIds.forEach((id, index) => {
      viewList[index] = this.viewList.find(i => i.id === id);
    });
    return viewList;
  }

  ngOnInit() {
    this.navs = this.getNav();
    this.viewList = this._viewSrv.viewList;
    this.viewIds = this._viewSrv.viewIds;
  }

  getNav() {
    return [
      {
        id: 'FileManager',
        name: 'File Manager',
        children: [
          {
            id: 'Connect',
            click: () => {
              window.open('/koko/elfinder/sftp/');
            },
            name: 'Connect'
          },
        ]
      },
      {
        id: 'View',
        name: 'View',
        children: [
          // 此处直接使用空串的话，在渲染时会被 nif 判断为 false 从而只有禁用效果而不展示文字内容
          {
            id: 'FullScreen',
            click: () => {
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
            },
            name: 'Full Screen'
          },
        ]
      },
      {
        id: 'Language',
        name: 'Language',
        children: this.getLanguageOptions(),
      },
      {
        id: 'Setting',
        name: 'Setting',
        children: [
          {
            id: 'General',
            name: this._i18n.instant('General'),
            click: () => {
              this._dialog.open(
                ElementSettingComponent,
                {
                  height: 'auto',
                  width: '500px',
                  data: {type: 'general', name: 'General'}
                });
            },
          },
          {
            id: 'GUI',
            name: this._i18n.instant('GUI'),
            click: () => {
              this._dialog.open(
                ElementSettingComponent,
                {
                  height: 'auto',
                  width: '500px',
                  data: {type: 'gui', name: 'GUI'}
                });
            }
          },
          {
            id: 'CLI',
            name: this._i18n.instant('CLI'),
            click: () => {
              this._dialog.open(
                ElementSettingComponent,
                {
                  height: 'auto',
                  width: '500px',
                  data: {type: 'cli', name: 'GUI'}
                });
            }
          }
        ]
      },
      {
        id: 'Tabs',
        name: this._i18n.instant('Tabs'),
        children: []
      },
      {
        id: 'Theme',
        name: this._i18n.instant('Theme'),
        children: [
          {
            id: 'Default',
            click: () => {
              localStorage.setItem('themeType', 'default');
              useTheme().switchTheme();
            },
            name: this._i18n.instant('Default')
          },
          {
            id: 'DarkBlue',
            click: () => {
              localStorage.setItem('themeType', 'darkBlue');
              useTheme().switchTheme();
            },
            name: this._i18n.instant('DarkBlue')
          }
        ]
      },
      {
        id: 'Help',
        name: 'Help',
        children: [
          {
            id: 'Document',
            click: () => {
              this.HELP_DOCUMENT_URL = this._settingSvc.globalSetting.HELP_DOCUMENT_URL;
              window.open(this.HELP_DOCUMENT_URL);
            },
            name: 'Document'
          },
          {
            id: 'Support',
            click: () => {
              this.HELP_SUPPORT_URL = this._settingSvc.globalSetting.HELP_SUPPORT_URL;
              window.open(this.HELP_SUPPORT_URL);
            },
            name: 'Support'
          },
          {
            id: 'Download',
            click: () => {
              window.open('/core/download/', '_blank');
            },
            name: 'Download',
          }
        ]
      },
    ];
  }

  getLanguageOptions() {
    const langOptions = [];
    this._settingSvc.afterInited().then((state) => {
      const languages = this._settingSvc.globalSetting.LANGUAGES;
      for (const langObj of languages) {
        langOptions.push({
          id: langObj.code,
          click: () => {
            this._i18n.use(langObj.code);
            window.location.reload();
          },
          name: langObj.name
        });
      }
    });
    return langOptions;
  }

  onJumpUi() {
    window.open('/ui/', '_blank');
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

