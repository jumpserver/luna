import {Component, Input, OnInit} from '@angular/core';
import {View, SystemUser, TreeNode, ConnectionTokenParam} from '@app/model';
import {HttpService, I18nService, SettingService} from '@app/services';
import {User} from '@app/globals';
import {ToastrService} from 'ngx-toastr';

interface InfoItem {
  name: string;
  value: string;
  label: any;
}

@Component({
  selector: 'elements-connector-static',
  templateUrl: './static.component.html',
  styleUrls: ['./static.component.scss']
})

export class ElementConnectorStaticComponent implements OnInit {
  @Input() view: View;

  node: TreeNode;
  sysUser: SystemUser;
  protocol: string;
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

  ngOnInit() {
    this.init();
  }

  async init() {
    const {node, sysUser, protocol} = this.view;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
    this.protocolPorts = {
      mysql: this.globalSetting.TERMINAL_MAGNUS_MYSQL_PORT,
      postgresql: this.globalSetting.TERMINAL_MAGNUS_POSTGRE_PORT,
      mariadb: this.globalSetting.TERMINAL_MAGNUS_MARIADB_PORT
    };
    const currentNodeData = node.meta.data || {}
    const oriHost = currentNodeData.attrs ? currentNodeData.attrs.host : node.meta.data.ip;
    this.name = `${node.name}(${oriHost})`;

    const param: ConnectionTokenParam = {
      system_user: sysUser.id,
      ...({application: node.id}) 
    }
    this.token = await this._http.getConnectionToken(param);
    this.setInfo();
    this.generateConnCli();
    this.loading = false;
  }

  setInfo() {
    const host = this.globalSetting.TERMINAL_MAGNUS_HOST;
    const port = this.protocolPorts[this.protocol];
    const attrs = this.node.meta.data.attrs || {};
    const database = attrs.database || '';
    this.infoItems = [
      {name: 'name', value: this.name, label: this._i18n.t('Name')},
      {name: 'host', value: host, label: this._i18n.t('Host')},
      {name: 'port', value: port,  label: this._i18n.t('Port')},
      {name: 'username', value: this.token.id, label: this._i18n.t('Username')},
      {name: 'password', value: this.token.secret,  label: this._i18n.t('Password')},
      {name: 'database', value: database, label: this._i18n.t('Database')},
      {name: 'protocol', value: this.protocol, label: this._i18n.t('Protocol')},
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
        cli = `PGPASSWORD=${passwordHolder} psql` +
          ` -U ${this.token.id}` +
          ` -h ${host}` +
          ` -d ${database}` +
          ` -p ${port || ''}`;
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
