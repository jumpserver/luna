import {Component, Input, OnInit} from '@angular/core';
import {Account, Asset, ConnectionToken, Endpoint, View} from '@app/model';
import {ConnectTokenService, HttpService, I18nService, SettingService} from '@app/services';

import {Command, InfoItem} from '../guide/model';

@Component({
  selector: 'elements-connector-magnus',
  templateUrl: './magnus.component.html',
  styleUrls: ['./magnus.component.scss']
})

export class ElementConnectorMagnusComponent implements OnInit {
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
              private _connectTokenSvc: ConnectTokenService,
              private _settingSvc: SettingService
  ) {
    this.globalSetting = this._settingSvc.globalSetting;
    this.showSetReusable = this.globalSetting.CONNECTION_TOKEN_REUSABLE;
  }

  async ngOnInit() {
    const {asset, account, protocol, smartEndpoint, connectToken} = this.view;
    this.token = connectToken;
    this.asset = asset;
    this.account = account;
    this.protocol = protocol;
    this.endpoint = smartEndpoint;

    const oriHost = this.asset.address;
    this.name = `${this.asset.name}(${oriHost})`;
    this.setDBInfo();
    this.genConnCli();
    this.loading = false;
    this.view.termComp = this;
  }

  setDBInfo() {
    const database = this.asset['spec_info']['db_name'];
    this.infoItems = [
      {name: 'name', value: this.name, label: this._i18n.t('Name')},
      {name: 'host', value: this.endpoint.getHost(), label: this._i18n.t('Host')},
      {name: 'port', value: this.endpoint.getPort(this.protocol), label: this._i18n.t('Port')},
      {name: 'username', value: this.token.id, label: this._i18n.t('Username')},
      {name: 'password', value: this.token.value, label: this._i18n.t('Password')},
      {name: 'database', value: this.protocol === 'oracle' ? this.token.id : database, label: this._i18n.t('Database')},
      {name: 'protocol', value: this.protocol, label: this._i18n.t('Protocol')},
      {name: 'date_expired', value: `${this.token.date_expired}`, label: this._i18n.t('Expire time')},
    ];
    if (this.showSetReusable) {
      this.infoItems.push({name: 'set_reusable', value: '', label: this._i18n.t('Set reusable')});
    }

    this.infoItems.push(
      {name: 'help_text', value: this._i18n.instant('Database token help text'), label: this._i18n.t('Help text')}
    );
    this.info = this.infoItems.reduce((pre, current) => {
      pre[current.name] = current.value;
      return pre;
    }, {});
  }

  genConnCli() {
    const {password, host, port, database, protocol} = this.info;
    // Password placeholders. Because there is a safe cli, the secret needs to be hidden, so the placeholders are replaced
    const passwordHolder = `@${password}@`;
    let cli = '';

    switch (this.protocol) {
      case 'mysql':
      case 'mariadb':
        cli = `mysql` +
          ` -u ${this.token.id}` +
          ` -p${passwordHolder}` +
          ` -h ${host}` +
          ` -P ${port || ''}` +
          ` ${database}`;
        break;
      case 'postgresql':
        cli = `psql` +
          ` "user=${this.token.id}` +
          ` password=${passwordHolder}` +
          ` host=${host}` +
          ` dbname=${database}` +
          ` port=${port || ''}"`;
        break;
      case 'redis':
        cli = `redis-cli` +
          ` -h ${host}` +
          ` -p ${port ? port : ''}` +
          ` -a ${this.token.id}` +
          `@${passwordHolder}`;
        break;
      case 'oracle':
        cli = `sqlplus` +
          ` ${this.token.id}` +
          `/${passwordHolder}` +
          `@${host}` +
          `:${this.endpoint.getPort(this.protocol)}` +
          `/${this.token.id}`;
        break;
      case 'sqlserver':
        cli = `sqlcmd` +
          ` -S ${host},${port}` +
          ` -U ${this.token.id}` +
          ` -P ${passwordHolder}` +
          ` -d ${database}`;
        break;
      default:
        cli = `Protocol '${protocol}' Not support now`;
    }
    const cliSafe = cli.replace(passwordHolder, this.passwordMask);
    const cliValue = cli.replace(passwordHolder, password);
    this.cli = cliValue;
    this.commands = [{
      title: this._i18n.instant('Connect command line'),
      value: cliValue,
      safeValue: cliSafe,
      helpText: '',
      callClient: true
    }];
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
