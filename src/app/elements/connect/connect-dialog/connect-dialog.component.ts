import {Component, OnInit, Inject, ViewChild, ChangeDetectorRef} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {AppService, LocalStorageService, LogService, SettingService} from '@app/services';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {ConnectType, ConnectData, TreeNode, SystemUser, AuthInfo} from '@app/model';
import {ElementManualAuthComponent} from './manual-auth/manual-auth.component';
import {BehaviorSubject} from 'rxjs';

@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'connect-dialog.component.html',
  styleUrls: ['./connect-dialog.component.scss'],
})
export class ElementConnectDialogComponent implements OnInit {
  @ViewChild('manualAuth', {static: false}) manualAuthRef: ElementManualAuthComponent;
  public onSubmit$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  public node: TreeNode;
  public outputData: ConnectData = new ConnectData();
  public systemUsers: SystemUser[];
  public manualAuthInfo: AuthInfo = new AuthInfo();

  public systemUserSelected: SystemUser = null;
  public connectType: ConnectType;
  public connectTypes = [];
  public autoLogin = false;

  constructor(public dialogRef: MatDialogRef<ElementConnectDialogComponent>,
              private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _logger: LogService,
              private _appSvc: AppService,
              private _localStorage: LocalStorageService,
              @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit() {
    this.systemUsers = this.data.systemUsers;
    this.node = this.data.node;
  }

  onSelectSystemUser(systemUser) {
    this.systemUserSelected = systemUser;
    if (!systemUser) {
      return;
    }
    this.setConnectTypes();
    // this._cdRef.detectChanges();
    setTimeout(() => {
      if (this.manualAuthRef) {
        this.manualAuthRef.onSystemUserChanged();
      }
    });
  }

  setConnectTypes() {
    const isRemoteApp = this.node.meta.type === 'application';
    this.connectTypes = this._appSvc.getProtocolConnectTypes(isRemoteApp)[this.systemUserSelected.protocol];
    this.connectType = this.getPreferConnectType() || this.connectTypes[0];
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  hasRDPClientTypes() {
    return this.connectType && this.connectType.id === 'rdpClient';
  }

  getPreferConnectType() {
    const preferConnectTypeId = this._appSvc.getProtocolPreferLoginType(this.systemUserSelected.protocol);
    const matchedTypes = this.connectTypes.filter((item) => item.id === preferConnectTypeId);
    if (matchedTypes.length === 1) {
      return matchedTypes[0];
    } else {
      return this.connectTypes[0];
    }
  }

  onConfirm() {
    this.outputData.systemUser = this.systemUserSelected;
    this.outputData.connectType = this.connectType;
    this.outputData.manualAuthInfo = this.manualAuthInfo;

    if (this.autoLogin) {
      this._appSvc.setPreLoginSelect(this.node, this.outputData);
    }

    this.onSubmit$.next(true);

    this._appSvc.setProtocolPreferLoginType(this.systemUserSelected.protocol, this.connectType.id);
    this.dialogRef.close(this.outputData);
  }
}
