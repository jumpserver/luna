import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {Account, Asset, ConnectionToken, Endpoint, View} from '@app/model';
import {ConnectTokenService, HttpService, I18nService, LogService, SettingService} from '@app/services';
import {User} from '@app/globals';
import {Command, InfoItem} from '../guide/model';


@Component({
  selector: 'elements-connector-koko',
  templateUrl: './koko.component.html',
  styleUrls: ['./koko.component.scss']
})
export class ElementConnectorKokoComponent implements OnInit {
  @Input() view: View;
  @ViewChild('terminal', {static: false}) iframe: ElementRef;

  iframeURL: any;
  asset: Asset;
  protocol: string;
  baseUrl: string;
  token: ConnectionToken;

  infoItems: Array<InfoItem> = [];
  commands: Array<Command> = [];
  info: any;
  account: Account;
  endpoint: Endpoint;
  methodName: string;
  loading = false;
  showSetReusable = false;

  constructor(private _logger: LogService,
              private _i18n: I18nService,
              private _http: HttpService,
              private _connectTokenSvc: ConnectTokenService,
              private _settingSvc: SettingService
  ) {
    this.showSetReusable = this._settingSvc.globalSetting.CONNECTION_TOKEN_REUSABLE;
  }

  ngOnInit() {
    const {asset, account, protocol, smartEndpoint, connectToken} = this.view;
    this.asset = asset;
    this.protocol = protocol;
    this.endpoint = smartEndpoint;
    this.account = account;
    this.token = connectToken;
    const url = smartEndpoint.getUrl();
    this.baseUrl = `${url}/koko`;
    this.methodName = this.view.connectMethod.value;
    if (this.methodName === 'ssh_guide') {
      this.setInfoItems();
      this.generateCli();
    } else {
      this.generateIframeURL();
    }
    this.view.termComp = this;
  }

  setInfoItems() {
    this.infoItems = [
      {name: 'name', value: `${this.asset.name}(${this.asset.address})`, label: this._i18n.t('Name')},
      {name: 'host', value: this.endpoint.host, label: this._i18n.t('Host')},
      {name: 'port', value: this.endpoint.getPort('ssh'), label: this._i18n.t('Port')},
      {name: 'username', value: `JMS-${this.token.id}`, label: this._i18n.t('Username')},
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

  generateCli() {
    const port = this.endpoint.getPort('ssh');
    let cli = `ssh JMS-${this.token.id}@${this.endpoint.host}`;
    let cliDirect = `ssh ${User.username}#${this.account.username}#${this.asset.id}@${this.endpoint.host}`;
    if (port !== '22') {
      cli += ` -p ${port}`;
      cliDirect += ` -p ${port}`;
    }

    this.commands = [
      {
        title: this._i18n.instant('Connect command line') + ' (' + this._i18n.instant('Using token') + ')',
        value: cli,
        safeValue: cli,
        helpText: this._i18n.instant('Password is token password on the table'),
        callClient: true
      },
      {
        title: this._i18n.instant('Connect command line') + ' (' + this._i18n.instant('Directly') + ')',
        value: cliDirect,
        safeValue: cliDirect,
        helpText: this._i18n.instant('Password is your password login to system'),
        callClient: true
      }
    ];
  }

  generateIframeURL() {
    switch (this.view.connectMethod.value) {
      case 'web_sftp':
        this.generateFileManagerURL();
        break;
      default:
        this.generateNodeConnectUrl();
        break;
    }
  }

  generateNodeConnectUrl() {
    const params = {};
    params['disableautohash'] = this.view.getConnectOption('disableautohash');
    params['token'] = this.view.connectToken.id;

    params['_'] = Date.now().toString();
    const query = Object.entries(params)
      .map(([key, value]) => {
        return `${key}=${value}`;
      })
      .reduce((a, b) => {
        return `${a}&${b}`;
      });

    this.iframeURL = `${this.baseUrl}/connect/?` + query;
  }

  generateFileManagerURL() {
    this.iframeURL = `${this.baseUrl}/elfinder/sftp/?token=${this.view.connectToken.id}&asset=${this.asset.id}`;
  }

  async reconnect() {
    this.loading = true;
    const oldConnectToken = this.view.connectToken;
    const newConnectToken = await this._connectTokenSvc.exchange(oldConnectToken);
    if (!newConnectToken) {
      return;
    }
    // 更新当前 view 的 connectToken
    this.view.connectToken = newConnectToken;
    await this.ngOnInit();
    this.loading = false;
  }
}
