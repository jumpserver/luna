import {Component, OnInit, Output, Inject, OnDestroy, EventEmitter} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {connectEvt} from '@app/globals';
import {AppService, HttpService, LogService, NavService, SettingService} from '@app/services';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {FormControl, Validators} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import {SystemUser, TreeNode, Asset} from '@app/model';
import {View} from '@app/model';


@Component({
  selector: 'elements-connect',
  templateUrl: './connect.component.html',
})
export class ElementConnectComponent implements OnInit, OnDestroy {
  @Output() onNewView: EventEmitter<View> = new EventEmitter<View>();

  hasLoginTo = false;

  constructor(private _appSvc: AppService,
              public _dialog: MatDialog,
              public _logger: LogService,
              private settingSvc: SettingService,
              private activatedRoute: ActivatedRoute,
              private _http: HttpService,
  ) {
  }

  ngOnInit(): void {
    connectEvt.asObservable().subscribe(evt => {
      switch (evt.action) {
        case 'asset': {
          this.Connect(evt.node);
          break;
        }
        case 'sftp': {
          this.connectFileManager(evt.node);
          break;
        }
      }
    });
    const loginTo = this._appSvc.getQueryString('login_to');
    const tp = this._appSvc.getQueryString('type') || 'asset';
    if (this.hasLoginTo || !loginTo) {
      return;
    }
    switch (tp) {
      case 'asset':
        this._http.filterMyGrantedAssetsById(loginTo).subscribe(
          nodes => {
            if (nodes.length === 1) {
              this.hasLoginTo = true;
              const node = nodes[0];
              this.Connect(node);
            }
          }
        );
        break;
      case 'remote_app':
        this._http.getMyGrantedRemoteApps(loginTo).subscribe(
          nodes => {
            if (nodes.length === 1) {
              this.hasLoginTo = true;
              const node = nodes[0];
              this.Connect(node);
            }
          }
        );
        break;
    }
  }

  ngOnDestroy(): void {
    connectEvt.unsubscribe();
  }

  Connect(node: TreeNode) {
    switch (node.meta.type) {
      case 'asset':
        this.connectAsset(node);
        break;
      case 'remote_app':
        this.connectRemoteApp(node);
        break;
      case 'database_app':
        this.connectDatabaseApp(node);
        break;
      default:
        alert('Unknown type: ' + node.meta.type);
    }
  }

  async connectAsset(node: TreeNode) {
    const host = node.meta.asset as Asset;
    const systemUsers = await this._http.getMyAssetSystemUsers(host.id).toPromise();
    let sysUser = await this.selectLoginSystemUsers(systemUsers);
    sysUser = await this.manualSetUserAuthLoginIfNeed(sysUser);
    if (sysUser && sysUser.id) {
      this.loginAsset(host, sysUser);
    } else {
      alert('该主机没有授权系统用户');
    }
  }

  async connectDatabaseApp(node: TreeNode) {
    this._logger.debug('Connect remote app: ', node.id);
    const systemUsers = await this._http.getMyDatabaseAppSystemUsers(node.id).toPromise();
    let sysUser = await this.selectLoginSystemUsers(systemUsers);
    sysUser = await this.manualSetUserAuthLoginIfNeed(sysUser);
    if (sysUser && sysUser.id) {
      this.loginDatabaseApp(node, sysUser);
    } else {
      alert('该主机没有授权系统用户');
    }
  }

  selectLoginSystemUsers(systemUsers: Array<SystemUser>): Promise<SystemUser> {
    const systemUserMaxPriority = this.filterMaxPrioritySystemUsers(systemUsers);
    let user: SystemUser;

    if (systemUserMaxPriority.length > 1) {
      return new Promise<SystemUser>(resolve => {
        const dialogRef = this._dialog.open(AssetTreeDialogComponent, {
          height: '250px',
          width: '500px',
          data: {users: systemUserMaxPriority}
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result) {
            for (const i of systemUserMaxPriority) {
              if (i.id.toString() === result.toString()) {
                user = i;
                resolve(user);
              }
            }
          }
          return null;
        });
      });
    } else if (systemUserMaxPriority.length === 1) {
      user = systemUserMaxPriority[0];
      return Promise.resolve(user);
    } else {
      return Promise.resolve(null);
    }
  }

  manualSetUserAuthLoginIfNeed(user: SystemUser): Promise<SystemUser> {
    if (!user || user.login_mode !== 'manual' || user.protocol !== 'rdp' || this.settingSvc.isSkipAllManualPassword()) {
      return Promise.resolve(user);
    }
    user = Object.assign({}, user);
    return new Promise(resolve => {
      const dialogRef = this._dialog.open(ManualPasswordDialogComponent, {
        height: '250px',
        width: '500px',
        data: {username: user.username}
      });
      dialogRef.afterClosed().subscribe(result => {
        if (!result) {
          return resolve(null);
        }
        if (result.skip) {
          return resolve(user);
        }
        user.username = result.username;
        user.password = result.password;
        return resolve(user);
      });
    });

  }


  async connectRemoteApp(node: TreeNode) {
    this._logger.debug('Connect remote app: ', node.id);
    const systemUsers = await this._http.getMyRemoteAppSystemUsers(node.id).toPromise();
    let sysUser = await this.selectLoginSystemUsers(systemUsers);
    sysUser = await this.manualSetUserAuthLoginIfNeed(sysUser);
    if (sysUser && sysUser.id) {
      return this.loginRemoteApp(node, sysUser);
    } else {
      alert('该应用没有授权系统用户');
    }
  }

  loginRemoteApp(node: TreeNode, user: SystemUser) {
    if (node) {
      const view = new View();
      view.nick = node.name;
      view.connected = true;
      view.editable = false;
      view.closed = false;
      view.remoteApp = node.id;
      view.user = user;
      view.type = 'rdp';
      this.onNewView.emit(view);
    }
  }
  loginDatabaseApp(node: TreeNode, user: SystemUser) {
    if (node) {
      const view = new View();
      view.host = node;
      view.nick = node.name;
      view.connected = true;
      view.editable = false;
      view.closed = false;
      view.DatabaseApp = node.id;
      view.user = user;
      view.type = 'database';
      this.onNewView.emit(view);
    }
  }

  connectFileManager(node: TreeNode) {
    const host = node.meta.asset as Asset;
    if (host) {
      const view = new View();
      view.nick = '[FILE] ' + host.hostname;
      view.connected = true;
      view.editable = false;
      view.closed = false;
      view.host = host;
      view.type = 'sftp';
      this.onNewView.emit(view);
      // jQuery('.tabs').animate({'scrollLeft': 150 * id}, 400);
    }
  }

  connectTerminal(node: TreeNode) {
    this.Connect(node);
  }


  loginAsset(host: Asset, user: SystemUser) {
    if (user) {
      const view = new View();
      view.nick = host.hostname;
      view.connected = true;
      view.editable = false;
      view.closed = false;
      view.host = host;
      view.user = user;
      if (user.protocol === 'ssh' || user.protocol === 'telnet') {
        view.type = 'ssh';
      } else if (user.protocol === 'rdp' || user.protocol === 'vnc') {
        view.type = 'rdp';
      }
      this.onNewView.emit(view);
    }
  }

  filterMaxPrioritySystemUsers(sysUsers: Array<SystemUser>): Array<SystemUser> {
    const priorityAll: Array<number> = sysUsers.map(s => s.priority);
    const maxPriority = Math.max(...priorityAll);
    return sysUsers.filter(s => s.priority === maxPriority);
  }
}


@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'dialog.html',
})
export class AssetTreeDialogComponent implements OnInit {
  UserSelectControl = new FormControl('', [Validators.required]);
  selected: any;

  constructor(public dialogRef: MatDialogRef<AssetTreeDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any,
              private _logger: LogService) {
  }

  ngOnInit() {
    this.selected = this.data.users[0].id;
    this.UserSelectControl.setValue(this.selected);
    // this._logger.debug(this.UserSelectControl);
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  compareFn: ((f1: any, f2: any) => boolean) | null = this.compareByValue;

  compareByValue(f1: any, f2: any) {
    return f1 && f2 && f1.value === f2.value;
  }
}

@Component({
  selector: 'elements-manual-password-dialog',
  templateUrl: 'manual-password-dialog.html',
})
export class ManualPasswordDialogComponent implements OnInit {
  constructor(@Inject(MAT_DIALOG_DATA) public data: any,
              public dialogRef: MatDialogRef<ManualPasswordDialogComponent>) {
  }

  onSkip() {
    this.data.skip = true;
    this.dialogRef.close(this.data);
  }

  onSkipAll() {
    this.data.skipAll = true;
    this.dialogRef.close(this.data);
  }

  onNoClick() {
    this.dialogRef.close();
  }

  onEnter() {
    this.dialogRef.close(this.data);
  }

  ngOnInit(): void {
  }
}
