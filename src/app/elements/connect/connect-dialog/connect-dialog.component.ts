import {Component, OnInit, Inject, ChangeDetectorRef} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {AppService, LogService, SettingService} from '@app/services';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {ConnectMethod, ConnectData, TreeNode, Account, AuthInfo, ConnectOption, Protocol} from '@app/model';
import {BehaviorSubject} from 'rxjs';


@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'connect-dialog.component.html',
  styleUrls: ['./connect-dialog.component.scss'],
})
export class ElementConnectDialogComponent implements OnInit {
  public onSubmit$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  public protocol: Protocol;
  public protocols: Array<Protocol>;
  public node: TreeNode;
  public outputData: ConnectData = new ConnectData();
  public accounts: Account[];
  public manualAuthInfo: AuthInfo = new AuthInfo();
  public accountSelected: Account = null;
  public connectMethod: ConnectMethod;
  public connectMethods = [];
  public autoLogin = false;
  public connectOptions: ConnectOption[] = [];

  constructor(public dialogRef: MatDialogRef<ElementConnectDialogComponent>,
              private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _logger: LogService,
              private _appSvc: AppService,
              @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit() {
    this.accounts = this.data.accounts;
    this.node = this.data.node;
    this.protocols = this.node.meta.data.protocols;
    this.onProtocolChange(this.protocols[0]);
  }

  onProtocolChange(protocol) {
    this.protocol = protocol;
    this.setConnectMethods();
  }

  onSelectAccount(account) {
    this.accountSelected = account;

    if (!account) {
      return;
    }
  }

  setConnectMethods() {
    this.connectMethods = this._appSvc.getProtocolConnectMethods(this.protocol.name);
    this.connectMethod = this.getPreferConnectMethod() || this.connectMethods[0];
  }

  getPreferConnectMethod() {
    const preferConnectTypeId = this._appSvc.getProtocolPreferLoginType(this.protocol.name);
    const matchedTypes = this.connectMethods.filter((item) => item.id === preferConnectTypeId);
    if (matchedTypes.length === 1) {
      return matchedTypes[0];
    } else {
      return this.connectMethods[0];
    }
  }

  onConfirm() {
    this.outputData.account = this.accountSelected;
    this.outputData.connectMethod = this.connectMethod;
    this.outputData.manualAuthInfo = this.manualAuthInfo;
    this.outputData.connectOptions = this.connectOptions;
    this.outputData.protocol = this.protocol;

    if (this.autoLogin) {
      this._appSvc.setPreLoginSelect(this.node, this.outputData);
    }

    this.onSubmit$.next(true);
    const nodeID = this._appSvc.getNodeTypeID(this.node);
    this._appSvc.setNodePreferAccount(nodeID, this.accountSelected.id);
    this._appSvc.setProtocolPreferLoginType('ssh', this.connectMethod.value);
    this.dialogRef.close(this.outputData);
  }

  onAdvancedOptionChanged(evt) {
    this.connectOptions = evt;
  }
}
