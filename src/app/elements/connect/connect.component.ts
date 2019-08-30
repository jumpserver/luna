import {Component, Input, OnInit, Output, Inject, OnDestroy, EventEmitter} from '@angular/core';
import {connectEvt} from '../../globals';
import {AppService, HttpService, LogService, NavService} from '../../app.service';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {FormControl, Validators} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import {SystemUser, TreeNode, Asset} from '../../model';
import {View} from '../content/model';
import * as jQuery from 'jquery/dist/jquery.min';

declare var $: any;

@Component({
  selector: 'elements-connect',
  templateUrl: './connect.component.html',
})
export class ElementConnectComponent implements OnInit, OnDestroy {
  @Output() onNewView: EventEmitter<View> = new EventEmitter<View>();

  pos = {left: '100px', top: '200px'};
  hasLoginTo = false;

  constructor(private _appSvc: AppService,
              public _dialog: MatDialog,
              public _logger: LogService,
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
      default:
        alert('Unknown type: ' + node.meta.type);
    }
  }

  connectAsset(node: TreeNode) {
    const host = node.meta.asset as Asset;
    this._http.getMyAssetSystemUsers(host.id).subscribe(systemUsers => {
      let user: SystemUser;
      if (systemUsers.length > 1) {
        // 检查系统用户优先级，获取最高优先级的
        user = this.checkPriority(systemUsers);
        if (user) {
          return this.manualSetUserAuthLoginIfNeed(host, user, this.loginAsset.bind(this));
        }
        const dialogRef = this._dialog.open(AssetTreeDialogComponent, {
          height: '200px',
          width: '300px',
          data: {users: systemUsers}
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result) {
            for (const i of systemUsers) {
              if (i.id.toString() === result.toString()) {
                user = i;
                break;
              }
            }
            return this.manualSetUserAuthLoginIfNeed(host, user, this.loginAsset.bind(this));
          }
        });
      } else if (systemUsers.length === 1) {
        user = systemUsers[0];
        this.manualSetUserAuthLoginIfNeed(host, user, this.loginAsset.bind(this));
      } else {
        alert('该主机没有授权登录用户');
      }
    });
  }

  connectRemoteApp(node: TreeNode) {
    const user = node.meta.user as SystemUser;
    return this.manualSetUserAuthLoginIfNeed(node, user, this.loginRemoteApp.bind(this));
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

  manualSetUserAuthLoginIfNeed(node: any, user: SystemUser, callback) {
    if (user.login_mode !== 'manual' || user.protocol !== 'rdp') {
      return callback(node, user);
    }
    user = Object.assign({}, user);
    const dialogRef = this._dialog.open(ManualPasswordDialogComponent, {
      height: '250px',
      width: '500px',
      data: {username: user.username}
    });
    dialogRef.afterClosed().subscribe(result => {
      if (!result) {
        return;
      }
      if (result.skip) {
        return callback(node, user);
      }
      user.username = result.username;
      user.password = result.password;
      return callback(node, user);
    });
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

  checkPriority(sysUsers: Array<SystemUser>) {
    let priority = -1;
    let user: any;
    for (const u of sysUsers) {
      if (u.priority > priority) {
        user = u;
        priority = u.priority;
      } else if (u.priority === priority) {
        return null;
      }
    }
    return user;
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
  PasswordControl = new FormControl('', [Validators.required]);
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
