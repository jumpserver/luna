/**
 * 主页导航条
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, Inject, OnInit} from '@angular/core';
import {AppService, HttpService, LocalStorageService, LogService} from '../../app.service';
import {CleftbarComponent} from '../../pages/control/cleftbar/cleftbar.component';
import {ControlComponent, NavList, View} from '../../pages/control/control/control.component';
import {DataStore, i18n} from '../../globals';
import * as jQuery from 'jquery/dist/jquery.min.js';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
declare let layer: any;

@Component({
  selector: 'elements-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.css'],
})
export class ElementNavComponent implements OnInit {
  DataStore = DataStore;
  NavList = NavList;
  ChangeLanWarningDialog: any;

  static Hide() {
    jQuery('elements-nav').hide();
  }

  constructor(private _appService: AppService,
              private _http: HttpService,
              private _logger: LogService,
              public _dialog: MatDialog,
              private _localStorage: LocalStorageService) {
    this._logger.log('nav.ts:NavComponent');
    this.getNav();
  }

  ngOnInit() {
  }

  toTab(idx) {
    ControlComponent.active(idx);
  }

  click(event) {
    this._logger.debug('nav.ts:NavComponent,click', event);
    switch (event) {
      case 'ReloadLeftbar': {
        CleftbarComponent.Reload();
        break;
      }
      case 'ConnectSFTP': {
        window.open('/coco/elfinder/sftp/');
        break;
      }
      case 'HideLeft': {
        CleftbarComponent.Hide();
        break;
      }
      case 'Settings': {
        this.Settings();
        break;
      }
      case 'ShowLeft': {
        CleftbarComponent.Show();
        break;
      }
      case 'Copy': {
        // this._appService.copy();
        break;
      }
      case 'FullScreen': {
        let ele:any = document.getElementsByClassName("window active ")[0];

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
        if (NavList.List[NavList.Active].termComp) {
          NavList.List[NavList.Active].termComp.reconnect();
        }
        break;
      }
      case 'Disconnect': {
        if (!confirm('断开当前连接? (RDP暂不支持)')) {
          break;
        }
        switch (NavList.List[NavList.Active].type) {
          case 'ssh': {
            ControlComponent.TerminalDisconnect(NavList.Active);
            break;
          }
          case 'rdp': {
            ControlComponent.RdpDisconnect(NavList.Active);
            break;
          }
          default: {
            // statements;
            break;
          }
        }
        break;
      }
      case'DisconnectAll': {
        if (!confirm('断开所有连接? (RDP暂不支持)')) {
          break;
        }
        ControlComponent.DisconnectAll();
        break;
      }
      case'ReconnectAll': {
        if (!confirm('确定重新连接所有已断开终端? (RDP暂不支持)')) {
          break;
        }
        for (let i = 0; i < NavList.List.length - 1; i++) {
          if (NavList.List[i].connected !== true && NavList.List[i].type === 'ssh' ) {
            NavList.List[i].termComp.reconnect();
          }
        }
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
      case 'SetResolution': {
        const dialog = this._dialog.open(
          RDPSolutionDialogComponent,
          {
            height: '200px',
            width: '300px'
          });
        dialog.afterClosed().subscribe(result => {
          if (result) {
            console.log(result);
          }
        });
        break;
      }
      case 'SetFont': {
        const dialog = this._dialog.open(
          FontDialogComponent,
          {
            height: '200px',
            width: '300px'
          });
        dialog.afterClosed().subscribe(result => {
          if (result) {
            console.log(result);
          }
        });
        break;
      }
      case 'EnterLicense': {
        this.EnterLicense();
        break;
      }
      case 'English': {
        const dialog = this._dialog.open(
          ChangLanWarningDialogComponent,
          {
            height: '200px',
            width: '300px',
            data: {
              title: 'Warning',
              note: 'The page will be reload, can you acceptable?',
              cancel: 'Cancel',
              confirm: 'Confirm',
            },
          });
        dialog.afterClosed().subscribe(result => {
          if (result) {
            this.English();
          }
        });
        break;
      }
      case 'Chinese': {
        const dialog = this._dialog.open(
          ChangLanWarningDialogComponent,
          {
            height: '200px',
            width: '300px',
            data: {
              title: '警告',
              note: '此页将被重载，是否确认?',
              cancel: '取消',
              confirm: '确认',
            },
          });
        dialog.afterClosed().subscribe(result => {
          if (result) {
            this.Language('cn');
          }
        });
        break;
      }
      default: {
        break;
      }
    }

  }

  EnterLicense() {
    layer.prompt({
      formType: 2,
      maxlength: 500,
      title: 'Please Input Code',
      scrollbar: false,
      area: ['400px', '300px'],
      moveOut: true,
      moveType: 1
    }, function (value, index) {
      DataStore.socket.emit('key', value);
      // layer.msg(value); //得到value
      layer.close(index);

    });
  }

  getNav() {
    DataStore.Nav = [{
      'id': 'File',
      'name': 'Server',
      'children': [
        {
          'id': 'Disconnect',
          'click': 'Disconnect',
          'name': 'Disconnect'
        },
        {
          'id': 'DisconnectAll',
          'click': 'DisconnectAll',
          'name': 'Disconnect all'
        },
        {
          'id': 'Reconnect',
          'click': 'Reconnect',
          'name': 'Reconnect'
        },
        {
          'id': 'ReconnectAll',
          'click': 'ReconnectAll',
          'name': 'Reconnect all'
        },
      ]
    }, {
      'id': 'FileManager',
      'name': 'File Manager',
      'children': [
        {
          'id': 'Connect',
          'click': 'ConnectSFTP',
          'name': 'Connect'
        },
      ]
    },
      {
      'id': 'View',
      'name': 'View',
      'children': [
        {
          'id': 'HideLeftManager',
          'click': 'HideLeft',
          'name': 'Hide left manager'
        },
        {
          'id': 'RDPResolution',
          'click': 'SetResolution',
          'name': 'RDP Resolution'
        },
        {
          'id': 'Font',
          'click': 'SetFont',
          'name': 'Font'
        },
        {
          'id': 'SplitVertical',
          'href': '',
          'name': 'Split vertical',
          'disable': true
        },
        {
          'id': 'CommandBar',
          'href': '',
          'name': 'Command bar',
          'disable': true
        },
        {
          'id': 'ShareSession',
          'href': '',
          'name': 'Share session (read/write)',
          'disable': true
        },
        {
          'id': 'FullScreen',
          'click': 'FullScreen',
          'name': 'Full Screen'
        }
        ]
    }, {
      'id': 'Help',
      'name': 'Help',
      'children': [
        {
          'id': 'Website',
          'click': 'Website',
          'name': 'Website'
        },
        {
          'id': 'Document',
          'click': 'Document',
          'name': 'Document'
        },
        {
          'id': 'Support',
          'click': 'Support',
          'name': 'Support'
        }]
    }, {
      'id': 'Language',
      'name': 'Language',
      'children': [
        {
          'id': 'English',
          'click': 'English',
          'name': 'English'
        },
        {
          'id': 'Chinese',
          'click': 'Chinese',
          'name': '中文'
        }
      ]
    }
    ];
  }

  Connect() {
    layer.prompt({
      formType: 2,
      maxlength: 500,
      title: 'Please Input Code',
      scrollbar: false,
      area: ['400px', '300px'],
      moveOut: true,
      moveType: 1
    }, function (value, index) {
      DataStore.socket.emit('key', value);
      layer.close(index);
    });
  }

  English() {
    this._localStorage.delete('lang');
    i18n.clear();
    location.reload();
  }

  Language(lan: string) {
    this._http.get('/luna/i18n/' + lan + '.json').subscribe(
      data => {
        this._localStorage.set('lang', JSON.stringify(data));
      }
    );
    const l = this._localStorage.get('lang');
    if (l) {
      const data = JSON.parse(l);
      Object.keys(data).forEach((k, _) => {
        i18n.set(k, data[k]);
      });
    }
    location.reload();
  }

  Settings() {
    const id = NavList.List.length - 1;
    NavList.List[id].nick = 'Setting';
    NavList.List[id].connected = true;
    NavList.List[id].edit = false;
    NavList.List[id].closed = false;
    NavList.List[id].type = 'settings';
    NavList.List.push(new View());
    NavList.Active = id;
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

@Component({
  selector: 'elements-rdp-solution-dialog',
  templateUrl: 'rdpSolutionDialog.html',
  styles: ['.mat-form-field { width: 100%; }']
})
export class RDPSolutionDialogComponent implements OnInit {
  solutions = ['Auto', '1024x768', '1366x768', '1400x900'];
  solution: string;
  cacheKey = 'rdpSolution';

  constructor(public dialogRef: MatDialogRef<RDPSolutionDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any) {
  }

  ngOnInit() {
    this.solution = localStorage.getItem(this.cacheKey) || 'Auto';
  }

  setSolution(value: string) {
    localStorage.setItem(this.cacheKey, value);
  }

  onSubmit() {
    this.setSolution(this.solution);
    this.dialogRef.close();
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}

@Component({
  selector: 'elements-font-size-dialog',
  templateUrl: 'fontDialog.html',
  styles: ['.mat-form-field { width: 100%; }']
})
export class FontDialogComponent implements OnInit {
  fontSize: string;
  solution: string;
  cacheKey = 'fontSize';

  constructor(public dialogRef: MatDialogRef<FontDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any) {
  }

  ngOnInit() {
    this.fontSize = localStorage.getItem(this.cacheKey) || '14';
  }

  setFontSize(value: string) {
    localStorage.setItem(this.cacheKey, value);
  }

  isValid() {
    const size = parseInt(this.fontSize, 10);
    return size > 5 && size < 60;
  }

  onSubmit() {
    this.setFontSize(this.fontSize);
    this.dialogRef.close();
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
