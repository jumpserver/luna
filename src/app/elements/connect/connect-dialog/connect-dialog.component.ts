import {Component, OnInit, Inject, ChangeDetectorRef} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {AppService, LogService, SettingService} from '@app/services';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {ConnectMethod, ConnectData, Account, AuthInfo, ConnectOption, Protocol, Asset} from '@app/model';
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
  public asset: Asset;
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
    this.asset = this.data.asset;
    this.protocols = this.asset.protocols;
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

  downloadRDPFile(method) {
    this.connectMethod = method;
    this.onConfirm(true);
  }

  onConfirm(downloadRDP = false) {
    this.outputData.account = this.accountSelected;
    this.outputData.connectMethod = this.connectMethod;
    this.outputData.manualAuthInfo = this.manualAuthInfo;
    this.outputData.connectOptions = this.connectOptions;
    this.outputData.protocol = this.protocol;
    this.outputData.downloadRDP = downloadRDP;

    if (!downloadRDP) {
      if (this.autoLogin) {
        this._appSvc.setPreLoginSelect(this.asset, this.outputData);
      }
      this._appSvc.setAssetPreferAccount(this.asset.id, this.accountSelected.id);
      this._appSvc.setProtocolPreferLoginType(this.protocol.name, this.connectMethod.value);
    }

    this.onSubmit$.next(true);
    this.dialogRef.close(this.outputData);
  }

  onAdvancedOptionChanged(evt) {
    this.connectOptions = evt;
  }
}
