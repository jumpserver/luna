import {Component, OnInit, Inject, ChangeDetectorRef} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {AppService, LogService, SettingService, I18nService} from '@app/services';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {ConnectMethod, ConnectData, Account, AuthInfo, ConnectOption, Protocol, Asset} from '@app/model';
import {BehaviorSubject} from 'rxjs';


@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'connect-dialog.component.html',
  styleUrls: ['./connect-dialog.component.scss'],
})
export class ElementConnectDialogComponent implements OnInit {
  public asset: Asset;
  public autoLogin = false;
  public protocol: Protocol;
  public accounts: Account[];
  public protocols: Array<Protocol>;
  public accountSelected: Account = null;
  public connectOptions: ConnectOption[] = [];
  public outputData: ConnectData = new ConnectData();
  public manualAuthInfo: AuthInfo = new AuthInfo();
  public connectMethod: ConnectMethod = new ConnectMethod();
  public preConnectData: ConnectData = new ConnectData();
  public onSubmit$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);

  constructor(public dialogRef: MatDialogRef<ElementConnectDialogComponent>,
              private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _logger: LogService,
              private _appSvc: AppService,
              private _i18n: I18nService,
              @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit() {
    this.accounts = this.data.accounts;
    this.asset = this.data.asset;
    this.preConnectData = this.data.preConnectData;
    this.protocols = this.asset.protocols || [];
    if (this.protocols.length === 0) {
      this.protocols = [{name: 'ssh', port: 22}];
    }
    this.setDefaults();
  }

  setDefaults() {
    if (this.preConnectData) {
      this.protocol = this.protocols.find(p => p.name === this.preConnectData.protocol.name);
      this.accountSelected = this.accounts.find(a => a.alias === this.preConnectData.account.alias) || new Account();
      this.connectMethod = this._appSvc.getProtocolConnectMethods(this.protocol.name).find(
        cm => cm.value === this.preConnectData.connectMethod.value
      );
    }

    if (!this.protocol) {
      this.protocol = this.protocols[0];
    }
    if (!this.accountSelected) {
      this.accountSelected = this.accounts[0];
    }
    if (!this.connectMethod) {
      this.connectMethod = this._appSvc.getProtocolConnectMethods(this.protocol.name)[0];
    }
  }

  onProtocolChange(protocol) {
    this.protocol = protocol;
  }

  onSelectAccount(account) {
    this.accountSelected = account;

    if (!account) {
      return;
    }
  }

  onConfirm(downloadRDP = false) {
    this.outputData.account = this.accountSelected;
    this.outputData.connectMethod = this.connectMethod;
    this.outputData.manualAuthInfo = this.manualAuthInfo;
    this.outputData.connectOptions = this.connectOptions;
    this.outputData.protocol = this.protocol;
    this.outputData.downloadRDP = downloadRDP;
    this.outputData.autoLogin = this.autoLogin;

    this._appSvc.setPreConnectData(this.asset, this.outputData);

    this.onSubmit$.next(true);
    this.dialogRef.close(this.outputData);
  }

  onAdvancedOptionChanged(evt) {
    this.connectOptions = evt;
  }
}
