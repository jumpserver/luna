import {Component, Input, OnInit} from '@angular/core';
import {View, SystemUser, TreeNode, ConnectionTokenParam, Endpoint} from '@app/model';
import {HttpService, I18nService, SettingService} from '@app/services';
import {User} from '@app/globals';
import {ToastrService} from 'ngx-toastr';

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

  node: TreeNode;
  sysUser: SystemUser;
  protocol: string;
  expire_time: string;
  endpoint: Endpoint;
  name: string;
  cli: string;
  cliSafe: string;
  protocolPorts: object;
  infoItems: Array<InfoItem>;
  info: any;
  globalSetting: any;
  loading = true;
  passwordMask = '******';
  passwordShow = '******';
  token: any;

  constructor(private _http: HttpService,
              private _i18n: I18nService,
              private _toastr: ToastrService,
              private _settingSvc: SettingService
  ) {
    this.globalSetting = this._settingSvc.globalSetting;
  }

  async ngOnInit() {
    const {node, sysUser, protocol, smartEndpoint} = this.view;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
    this.endpoint = smartEndpoint;

    const oriHost = this.node.meta.data.attrs.host;
    this.name = `${this.node.name}(${oriHost})`;
    const param: ConnectionTokenParam = {
      system_user: sysUser.id,
      ...({application: node.id})
    };
    this.token = await this._http.getConnectionToken(param);
    this.setDBInfo();
    this.generateConnCli();
    this.loading = false;
  }

  setDBInfo() {
    const host = this.endpoint.getHost();
    const port = this.endpoint.getPort(this.protocol);
    const attrs = this.node.meta.data.attrs || {};
    const database = attrs.database || '';
    this.infoItems = [
      {name: 'name', value: this.name, label: this._i18n.t('Name')},
      {name: 'host', value: host, label: this._i18n.t('Host')},
      {name: 'port', value: port, label: this._i18n.t('Port')},
      {name: 'username', value: this.token.id, label: this._i18n.t('Username')},
      {name: 'password', value: this.token.secret,  label: this._i18n.t('Password')},
      {name: 'database', value: database, label: this._i18n.t('Database')},
      {name: 'protocol', value: this.protocol, label: this._i18n.t('Protocol')},
      {name: 'expire_time', value: `${this.token.expire_time} s` , label: this._i18n.t('Expire time')},
    ];
    this.info = this.infoItems.reduce((pre, current) => {
      pre[current.name] = current.value;
      return pre;
    }, {});
  }

  generateConnCli() {
    const {username, password, host, port, database, protocol} = this.info;
    // Password placeholders. Because there is a safe cli, the password needs to be hidden, so the placeholders are replaced
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
      default:
        cli = `Protocol '${protocol}' Not support now`;
    }
    this.cliSafe = cli.replace(passwordHolder, this.passwordMask);
    this.cli = cli.replace(passwordHolder, password);
  }

  startClient() {
    const {protocol} = this.info;
    const data = {
      protocol,
      username: User.username,
      ...({command: this.cli})
    };
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
    const msg = await this._i18n.t('Copied');
    this._toastr.success(msg);
  }
}
