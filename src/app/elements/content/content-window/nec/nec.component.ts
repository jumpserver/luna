import {Component, Input, OnInit} from '@angular/core';
import {Account, Asset, ConnectionToken, Endpoint, View} from '@app/model';
import {ConnectTokenService, HttpService, I18nService, SettingService} from '@app/services';
import {ToastrService} from 'ngx-toastr';

import { Command, InfoItem } from '../guide/model';
import { User } from '@app/globals';

@Component({
  selector: 'elements-connector-nec',
  templateUrl: './nec.component.html',
  styleUrls: ['./nec.component.scss']
})

export class ElementConnectorNecComponent implements OnInit {
  @Input() view: View;

  asset: Asset;
  account: Account;
  protocol: string;
  endpoint: Endpoint;
  name: string;
  cli: string;
  infoItems: Array<InfoItem> = [];
  info: any;
  globalSetting: any;
  loading = true;
  passwordMask = '******';
  passwordShow = '******';
  token: ConnectionToken;
  showSetReusable: boolean;
  commands: Array<Command> = [];

  constructor(private _http: HttpService,
              private _i18n: I18nService,
              private _toastr: ToastrService,
              private _connectTokenSvc: ConnectTokenService,
              private _settingSvc: SettingService
  ) {
    this.globalSetting = this._settingSvc.globalSetting;
    this.showSetReusable = this.globalSetting.CONNECTION_TOKEN_REUSABLE;
  }

  async ngOnInit() {
    const { asset, account, protocol, smartEndpoint, connectToken } = this.view;
    this.token = connectToken;
    this.asset = asset;
    this.account = account;
    this.protocol = protocol;
    this.endpoint = smartEndpoint;

    // 处理 panda nec connect method
    switch (this.token.connect_options['virtualappConnectMethod']) {
      case 'client':
        this.protocol = 'vnc';
        break;
      default:
        break;
    }


    const oriHost = this.asset.address;
    this.name = `${this.asset.name}(${oriHost})`;
    this.setConnectionInfo();
    this.genConnCli();
    this.loading = false;
    this.view.termComp = this;
  }

  setConnectionInfo() {
    this.infoItems = [
      {name: 'name', value: this.name, label: this._i18n.t('Name')},
      {name: 'host', value: this.endpoint.getHost(), label: this._i18n.t('Host')},
      {name: 'port', value: this.endpoint.getPort(this.protocol), label: this._i18n.t('Port')},
      {name: 'username', value: this.token.id, label: this._i18n.t('Username')},
      {name: 'password', value: this.token.value, label: this._i18n.t('Password')},
      {name: 'protocol', value: this.protocol, label: this._i18n.t('Protocol')},
      {name: 'date_expired', value: `${this.token.date_expired}`, label: this._i18n.t('Expire time')},
    ];
    if (this.showSetReusable) {
      this.infoItems.push({name: 'set_reusable', value: '', label: this._i18n.t('Set reusable')});
    }

    this.info = this.infoItems.reduce((pre, current) => {
      pre[current.name] = current.value;
      return pre;
    }, {});
  }

  genConnCli() {
    const {password, host, port, protocol} = this.info;
    // Password placeholders. Because there is a safe cli, the secret needs to be hidden, so the placeholders are replaced
    const passwordHolder = `@${password}@`;
    let cli = '';

    switch (this.protocol) {
      case 'vnc':
        cli = `vncviewer` +
          ` -UserName=${this.token.id}` +
          ` ${host}:${port || '5900'}`;
        break;

      default:
        cli = `Protocol '${protocol}' Not support now`;
    }
    const cliSafe = cli.replace(passwordHolder, this.passwordMask);
    const cliValue = cli.replace(passwordHolder, password);
    this.cli = cliValue;
    const vncPort = port || '5900';
    const cliDirect = `vncviewer -UserName=${User.username}#${this.account.username}#${this.asset.id} ${this.endpoint.host}:${vncPort}`;

    this.commands = [
      {
        title: this._i18n.instant('Connect command line') + ' (' + this._i18n.instant('Using token') + ')',
        value: cliValue,
        safeValue: cliSafe,
        helpText:  this._i18n.instant('Password is token password on the table'),
        callClient: false
    },
      {
        title: this._i18n.instant('Connect command line') + ' (' + this._i18n.instant('Directly') + ')',
        value: cliDirect,
        safeValue: cliDirect,
        helpText: this._i18n.instant('Password is your password login to system'),
        callClient: false
      }
    ];
  }

  async reconnect() {
    const oldConnectToken = this.view.connectToken;
    const newConnectToken = await this._connectTokenSvc.exchange(oldConnectToken);
    if (!newConnectToken) {
      return;
    }
    // 更新当前 view 的 connectToken
    this.view.connectToken = newConnectToken;
    await this.ngOnInit();
    // 刷新完成隐藏密码
    this.passwordShow = this.passwordMask;
  }
}
