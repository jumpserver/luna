import { BehaviorSubject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { Component, Inject, OnInit } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { Account, Asset, AuthInfo, ConnectData, ConnectMethod, Protocol } from '@app/model';
import { AppService, HttpService, I18nService, LogService, SettingService } from '@app/services';

@Component({
  standalone: false,
  selector: 'elements-connect-dialog',
  templateUrl: 'connect-dialog.component.html',
  styleUrls: ['connect-dialog.component.scss']
})
export class ElementConnectDialogComponent implements OnInit {
  public asset: Asset;
  public protocol: Protocol;
  public connectOption: Object;
  public accounts: Array<Account>;
  public protocols: Array<Protocol>;

  public manualAuthInfo: AuthInfo = new AuthInfo();
  public outputData: ConnectData = new ConnectData();
  public accountOrUsernameChanged = new BehaviorSubject(false);
  public onSubmit$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  public connectMethod: ConnectMethod = new ConnectMethod('Null', '', 'null', 'null');

  public accountSelected: Account = null;
  public preConnectData: ConnectData = null;

  public onlineNum: number = null;
  public autoLogin: boolean = false;
  public disabled: boolean = false;
  public viewAssetOnlineSessionInfo: boolean = true;

  public disabledReason: string = '';

  constructor(
    @Inject(NZ_MODAL_DATA) public data: any,
    private _i18n: I18nService,
    private _http: HttpService,
    private _appSvc: AppService,
    private _modalRef: NzModalRef,
    private _settingSvc: SettingService
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
    console.log('Asset: ', this.asset);
    return this.asset.permed_protocols.filter(item => item.public);
  }

  setDefaults() {
    if (this.preConnectData) {
      const preProtocol = this.preConnectData.protocol || this.protocols[0];

      this.protocol = this.protocols.find(p => p.name === preProtocol.name) || this.protocols[0];

      // 找到预选择的账号，但不直接设置，让 select-account 组件处理
      const preSelectedAccount = this.accounts.find(
        a => a.alias === this.preConnectData.account.alias
      );
      if (preSelectedAccount) {
        this.accountSelected = preSelectedAccount;
      }

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
