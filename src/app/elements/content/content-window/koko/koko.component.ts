import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {Account, Asset, ConnectionToken, Endpoint, View} from '@app/model';
import {I18nService, LogService} from '@app/services';
import {MatTooltip} from '@angular/material/tooltip';
import {User} from '@app/globals';

interface InfoItem {
  name: string;
  value: string;
  label: any;
}

@Component({
  selector: 'elements-connector-koko',
  templateUrl: './koko.component.html',
  styleUrls: ['./koko.component.scss']
})
export class ElementConnectorKokoComponent implements OnInit {
  @Input() view: View;
  @ViewChild('terminal', {static: false}) iframe: ElementRef;
  @ViewChild(MatTooltip, {static: false}) tooltip: MatTooltip;

  iframeURL: any;
  asset: Asset;
  protocol: string;
  baseUrl: string;
  token: ConnectionToken;

  infoItems: Array<InfoItem>;
  info: any;
  cliSafe: string;
  cli: string;
  cliDirect: string;
  account: Account;
  endpoint: Endpoint;
  hoverClipTip: string;
  methodName: string;
  passwordShow: string = '******';
  passwordMask: string = '******';

  constructor(private _logger: LogService,
              private _i18n: I18nService,
  ) {
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
    this.info = this.infoItems.reduce((pre, current) => {
      pre[current.name] = current.value;
      return pre;
    }, {});
  }

  showPassword($event) {
    $event.stopPropagation();
    if (this.passwordShow === this.passwordMask) {
      this.passwordShow = this.info.password;
    } else {
      this.passwordShow = this.passwordMask;
    }
  }

  generateCli() {
    const port = this.endpoint.getPort('ssh');
    this.cli = `ssh -l JMS-${this.token.id} -p ${port} ${this.endpoint.host}`;
    this.cliSafe = this.cli;

    this.cliDirect = `ssh -l ${User.username}#${this.account.username}#${this.asset.id} -p ${port} ${this.endpoint.host}`;
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

  setK8sParams(params) {
    Object.keys(this.view.k8sInfo).forEach(k => {
      const v = this.view.k8sInfo[k];
      if (v) {
        params[k] = this.view.k8sInfo[k];
      }
    });
  }

  generateNodeConnectUrl() {
    const params = {};

    params['disableautohash'] = this.view.getConnectOption('disableautohash');
    params['token'] = this.view.connectToken.id;
    if (this.view.k8sInfo) {
      this.setK8sParams(params);
    }

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

  async onCopySuccess(evt) {
    this.hoverClipTip = this._i18n.instant('Copied');
  }

  onHoverClipRef(evt) {
    this.hoverClipTip = this._i18n.instant('Click to copy');
  }

  startClient(event) {

  }

}
