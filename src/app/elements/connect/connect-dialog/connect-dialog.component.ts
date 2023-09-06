import {ChangeDetectorRef, Component, Inject, OnInit} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {AppService, HttpService, I18nService, LogService, SettingService} from '@app/services';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {Account, Asset, AuthInfo, ConnectData, ConnectMethod, ConnectOption, Protocol} from '@app/model';
import {BehaviorSubject} from 'rxjs';
import {debounceTime} from 'rxjs/operators';


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
  public connectMethod: ConnectMethod = new ConnectMethod('Null', '', 'null', 'null');
  public preConnectData: ConnectData = new ConnectData();
  public onSubmit$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  public accountOrUsernameChanged = new BehaviorSubject(false);
  public isAppletClientMethod = false;
  public onlineNum: number = null;

  constructor(public dialogRef: MatDialogRef<ElementConnectDialogComponent>,
              private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _http: HttpService,
              private _logger: LogService,
              private _appSvc: AppService,
              private _i18n: I18nService,
              @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
  }

  ngOnInit() {
    this.accounts = this.data.accounts;
    this.asset = this.data.asset;
    this.preConnectData = this.data.preConnectData;
    this.protocols = this.getProtocols();
    if (this.protocols.length === 0) {
      this.protocols = [{name: 'ssh', port: 22, public: true, setting: {}}];
    }
    this._settingSvc.appletConnectMethod$.subscribe((state) => {
      this.isAppletClientMethod = state === 'client';
    });
    this.setDefaults();
    this.accountOrUsernameChanged.pipe(debounceTime(500))
      .subscribe(_ => {
        this.getOnlineNum();
      });
  }

  getProtocols() {
    const protocols = this.asset.protocols.filter((item) => item.public);
    return protocols || [];
  }

  setDefaults() {
    if (this.preConnectData) {
      const preProtocol = this.preConnectData.protocol || this.protocols[0];
      this.protocol = this.protocols.find(p => p.name === preProtocol.name) || this.protocols[0];
      this.accountSelected = this.accounts.find(a => a.alias === this.preConnectData.account.alias) || new Account();
      const connectMethod = this._appSvc.getProtocolConnectMethods(this.protocol.name).find(
        cm => cm.value === this.preConnectData.connectMethod.value
      );
      if (connectMethod) {
        this.connectMethod = connectMethod;
      }
    }

    if (!this.protocol) {
      this.protocol = this.protocols[0];
    }
    if (!this.accountSelected) {
      this.accountSelected = this.accounts[0];
    }
    if (!this.connectMethod) {
      const connectMethods = this._appSvc.getProtocolConnectMethods(this.protocol.name);
      if (connectMethods.length > 0) {
        this.connectMethod = connectMethods[0];
      }
    }
  }

  onProtocolChange(protocol) {
    this.protocol = protocol;
    this.getOnlineNum();
  }

  getOnlineNum() {
    if (this.protocol.name !== 'rdp') {
      return;
    }
    let account = this.accountSelected.username;
    if (!this.accountSelected.has_secret) {
      account = this.manualAuthInfo.username;
    }
    if (!account) {
      return;
    }
    this._http.getSessionOnlineNum(this.asset.id, account)
      .subscribe((data) => {
        this.onlineNum = data['count'];
      });
  }

  onSelectAccount(account) {
    this.accountSelected = account;
    this.accountOrUsernameChanged.next(true);

    if (!account) {
      return;
    }
  }

  onManualUsernameChanged(evt) {
    this.accountOrUsernameChanged.next(true);
  }

  isConnectDisabled(): Boolean {
    if (this.accounts.length === 0) {
      return true;
    }
    if (!this.connectMethod || this.connectMethod.disabled === true) {
      return true;
    }
    if (
      this.connectMethod.component === 'razor' ||
      (this.connectMethod.type === 'applet' && this.isAppletClientMethod)
    ) {
      return !this._settingSvc.hasXPack();
    }
    return false;
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
