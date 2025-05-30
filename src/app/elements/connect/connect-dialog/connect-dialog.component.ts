import {ChangeDetectorRef, Component, Inject, OnInit} from '@angular/core';
import {AppService, HttpService, I18nService, LogService, SettingService} from '@app/services';
import {Account, Asset, AuthInfo, ConnectData, ConnectMethod, Protocol} from '@app/model';
import {BehaviorSubject} from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import {NZ_MODAL_DATA, NzModalRef} from 'ng-zorro-antd/modal';

class ConnectButtonInfo {
  disabled: boolean = false;
  reason: string = '';
}

@Component({
  standalone: false,
  selector: 'elements-connect-dialog',
  templateUrl: 'connect-dialog.component.html',
  styleUrls: ['connect-dialog.component.scss']
})
export class ElementConnectDialogComponent implements OnInit {
  public asset: Asset;
  public accounts: Array<Account>;
  public preConnectData: ConnectData = null;
  public autoLogin = false;
  public protocol: Protocol;
  public protocols: Array<Protocol>;
  public accountSelected: Account = null;
  public connectOption: Object;
  public outputData: ConnectData = new ConnectData();
  public viewAssetOnlineSessionInfo: boolean = true;
  public manualAuthInfo: AuthInfo = new AuthInfo();
  public connectMethod: ConnectMethod = new ConnectMethod('Null', '', 'null', 'null');
  public onSubmit$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  public accountOrUsernameChanged = new BehaviorSubject(false);
  public onlineNum: number = null;
  public disabled: boolean = false;
  public disabledReason: string = '';

  constructor(
    @Inject(NZ_MODAL_DATA) public data: any,
    private _settingSvc: SettingService,
    private _cdRef: ChangeDetectorRef,
    private _modalRef: NzModalRef,
    private _http: HttpService,
    private _logger: LogService,
    private _appSvc: AppService,
    private _i18n: I18nService
  ) {
    this.asset = this.data.asset;
    this.preConnectData = this.data.preConnectData || null;
    this.accounts = this.data.accounts || [];
  }

  ngOnInit() {
    this.protocols = this.getProtocols();
    const valid = this.validate();

    if (!valid) {
      return;
    }

    this.setDefaults();
    this.accountOrUsernameChanged.pipe(debounceTime(500)).subscribe(_ => {
      this.getOnlineNum();
    });
  }

  validate() {
    let disabled = false;
    let transKey = '';

    if (this.protocols.length === 0) {
      disabled = true;
      transKey = 'connectDisabledTipsNoProtocol';
    } else if (this.accounts.length === 0) {
      disabled = true;
      transKey = 'connectDisabledTipsNoAccount';
    } else if (this.connectMethod && this.connectMethod.disabled === true) {
      disabled = true;
      transKey = 'connectDisabledTipsMethodDisabled';
    } else if (!this.connectMethod) {
      disabled = true;
      transKey = 'connectDisabledTipsNoConnectMethod';
    }
    this.disabled = disabled;
    this.disabledReason = transKey ? this._i18n.instant(transKey) : '';
    return !disabled;
  }

  getProtocols() {
    console.log('Asset: ', this.asset)
    return this.asset.permed_protocols.filter(item => item.public);
  }

  setDefaults() {
    if (this.preConnectData) {
      const preProtocol = this.preConnectData.protocol || this.protocols[0];

      this.protocol = this.protocols.find(p => p.name === preProtocol.name) || this.protocols[0];

      this.accountSelected =
        this.accounts.find(a => a.alias === this.preConnectData.account.alias) || new Account();

      const connectMethod = this._appSvc
        .getProtocolConnectMethods(this.protocol.name)
        .find(cm => cm.value === this.preConnectData.connectMethod.value);

      if (connectMethod) {
        this.connectMethod = connectMethod;
      }

      this.connectOption = this.preConnectData.connectOption || {};
    }

    if (typeof this.connectOption !== 'object' || Array.isArray(this.connectOption)) {
      this.connectOption = {};
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
    this.viewAssetOnlineSessionInfo = this._settingSvc.globalSetting.VIEW_ASSET_ONLINE_SESSION_INFO;
  }

  onProtocolChange(protocol) {
    this.protocol = protocol;
    this.getOnlineNum();
  }

  getOnlineNum() {
    if (!this.viewAssetOnlineSessionInfo) {
      return;
    }
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
    this._http.getSessionOnlineNum(this.asset.id, account).subscribe(data => {
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

  onConfirm(downloadRDP = false) {
    this.outputData.account = this.accountSelected;
    this.outputData.connectMethod = this.connectMethod;
    this.outputData.manualAuthInfo = this.manualAuthInfo;
    this.outputData.connectOption = this.connectOption;
    this.outputData.protocol = this.protocol;
    this.outputData.downloadRDP = downloadRDP;
    this.outputData.autoLogin = this.autoLogin;

    this._appSvc.setPreConnectData(this.asset, this.outputData);

    this.onSubmit$.next(true);
    this._modalRef.close(this.outputData);
  }
}
