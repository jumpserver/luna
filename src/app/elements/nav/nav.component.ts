import {Component, Inject, OnInit} from '@angular/core';
import {HttpService, LocalStorageService, NavService, LogService, ViewService} from '@app/services';
import {DataStore} from '@app/globals';
import { TranslateService } from '@ngx-translate/core';
import {CookieService} from 'ngx-cookie-service';
import {ElementLeftBarComponent} from '@app/elements/left-bar/left-bar.component';
import {ElementSettingComponent} from '@app/elements/setting/setting.component';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {Nav, View} from '@app/model';

@Component({
  selector: 'elements-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.css'],
})
export class ElementNavComponent implements OnInit {
  DataStore = DataStore;
  navs: Array<Nav>;
  _asyncTree = false;
  viewList: Array<View>;

  constructor(private _http: HttpService,
              private _logger: LogService,
              public _dialog: MatDialog,
              public _navSvc: NavService,
              private _cookie: CookieService,
              public _viewSrv: ViewService,
              public translate: TranslateService,
              private _localStorage: LocalStorageService) {
  }

  ngOnInit() {
    this.navs = this.getNav();
    this.viewList = this._viewSrv.viewList;
  }

  get treeLoadAsync() {
    return this._asyncTree;
  }

  set treeLoadAsync(value) {
    this._asyncTree = value;
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
      case 'Website': {
        window.open('http://www.jumpserver.org');
        break;
      }
      case 'Document': {
        window.open('http://docs.jumpserver.org/');
        break;
      }
      case 'Support': {
        window.open('https://market.aliyun.com/products/53690006/cmgj026011.html?spm=5176.730005.0.0.cY2io1');
        break;
      }
      case 'English': {
        this.translate.use('en');
        localStorage.setItem('currentLanguage', 'en');
        break;
      }
      case 'Chinese': {
        this.translate.use('zh');
        localStorage.setItem('currentLanguage', 'zh');
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
            id: 'Website',
            click: 'Website',
            name: 'Website'
          },
          {
            id: 'Document',
            click: 'Document',
            name: 'Document'
          },
          {
            id: 'Support',
            click: 'Support',
            name: 'Support'
          }]
      },
    ];
  }
  Setting() {
    const dialog = this._dialog.open(
      ElementSettingComponent,
      {
        height: '370px',
        width: '400px',
      });
    dialog.afterClosed().subscribe(result => {
      if (result) {
      }
    });
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

