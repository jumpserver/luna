import {Component, Input, OnInit, ViewChild} from '@angular/core';
import {Account, Asset, ConnectionToken, Endpoint, View} from '@app/model';
import {ConnectTokenService, HttpService, I18nService, SettingService} from '@app/services';
import {User} from '@app/globals';
import {ToastrService} from 'ngx-toastr';
import {MatTooltip} from '@angular/material/tooltip';

interface InfoItem {
  name: string;
  value: string;
  label: any;
}

@Component({
  selector: 'elements-connector-magnus',
  templateUrl: './magnus.component.html',
  styleUrls: ['./magnus.component.scss']
})

export class ElementConnectorMagnusComponent implements OnInit {
  @Input() view: View;
  @ViewChild(MatTooltip, {static: false}) tooltip: MatTooltip;

  asset: Asset;
  account: Account;
  protocol: string;
  expire_time: string;
  endpoint: Endpoint;
  name: string;
  cli: string;
  cliSafe: string;
  infoItems: Array<InfoItem>;
  info: any;
  globalSetting: any;
  loading = true;
  passwordMask = '******';
  passwordShow = '******';
  token: ConnectionToken;
  showSetReusable: boolean;
  hoverClipTip: string = this._i18n.instant('Click to copy');

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
    const {asset, account, protocol, smartEndpoint, connectToken} = this.view;
    this.token = connectToken;
    this.asset = asset;
    this.account = account;
    this.protocol = protocol;
    this.endpoint = smartEndpoint;

    const oriHost = this.asset.address;
    this.name = `${this.asset.name}(${oriHost})`;
    this.setDBInfo();
    this.generateConnCli();
    this.loading = false;
    this.view.termComp = this;
  }

  setDBInfo() {
    const host = this.endpoint.getHost();
    const port = this.endpoint.getPort(this.protocol);
    const database = this.asset.spec_info.db_name;
    this.infoItems = [
      {name: 'name', value: this.name, label: this._i18n.t('Name')},
      {name: 'host', value: host, label: this._i18n.t('Host')},
      {name: 'port', value: port, label: this._i18n.t('Port')},
      {name: 'username', value: this.token.id, label: this._i18n.t('Username')},
      {name: 'password', value: this.token.value, label: this._i18n.t('Password')},
      {name: 'database', value: database, label: this._i18n.t('Database')},
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

  generateConnCli() {
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
          `/${database}`;
        break;
      default:
        cli = `Protocol '${protocol}' Not support now`;
    }
    this.cliSafe = cli.replace(passwordHolder, this.passwordMask);
    this.cli = cli.replace(passwordHolder, password);
  }

  setReusable(event) {
    this._connectTokenSvc.setReusable(this.token, event.checked).subscribe(
      res => {
        this.token = Object.assign(this.token, res);
        this.info['date_expired'] = `${this.token.date_expired}`;
      },
      error => {
        this.token.is_reusable = false;
        this._toastr.error(error.error.msg || error.error.is_reusable || error.message);
      }
    );
  }

  startClient() {
    const data = {
      'id': this.token.id,
      'name': this.endpoint.getHost() + '-' + this.token.id.substring(0, 18),
      'protocol': this.protocol,
      'host': this.endpoint.getHost(),
      'port': this.endpoint.getPort(this.protocol),
      'dbname': this.asset.spec_info.db_name,
      'username': this.token.id,
      'value': this.token.value,
      'command': this.cli,
    }
    const json = JSON.stringify(data);
    const b64 = window.btoa(json);
    const url = 'jms://' + b64;
    window.open(url);
  }

  showPassword($event) {
    $event.stopPropagation();
    if (this.passwordShow === this.passwordMask) {
      this.passwordShow = this.info.password;
    } else {
      this.passwordShow = this.passwordMask;
    }
  }

  async onCopySuccess(evt) {
    this.hoverClipTip = this._i18n.instant('Copied');
  }

  onHoverClipRef(evt) {
    this.hoverClipTip = this._i18n.instant('Click to copy');
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
