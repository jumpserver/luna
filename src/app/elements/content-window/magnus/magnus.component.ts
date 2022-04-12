import {Component, Input, OnInit} from '@angular/core';
import {View, SystemUser, TreeNode, Endpoint} from '@app/model';
import {HttpService, I18nService, LogService, SettingService} from '@app/services';
import {User} from '@app/globals';
import {ToastrService} from 'ngx-toastr';


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
  endpoint: Endpoint;
  name: string;
  cli: string;
  cliSafe: string;
  protocolPorts: object;
  dbInfoItems: Array<any>;
  dbInfo: any;
  globalSetting: any;
  loading = true;
  passwordMask = '******';
  passwordShow = '******';
  token: any;

  constructor(private _logger: LogService,
              private _http: HttpService,
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
    this.token = await this._http.getConnectionToken(this.sysUser.id, '', this.node.id);
    this.setDBInfo();
    this.generateConnCli();
    this.loading = false;
  }

  setDBInfo() {
    const host = this.endpoint.getHost();
    const port = this.endpoint.getPort(this.protocol);
    const database = this.node.meta.data.attrs.database;
    this.dbInfoItems = [
      {name: 'name', value: this.name, label: this._i18n.t('Name')},
      {name: 'host', value: host, label: this._i18n.t('Host')},
      {name: 'port', value: port,  label: this._i18n.t('Port')},
      {name: 'username', value: this.token.id, label: this._i18n.t('Username')},
      {name: 'password', value: this.token.secret,  label: this._i18n.t('Password')},
      {name: 'database', value: database, label: this._i18n.t('Database')},
      {name: 'protocol', value: this.protocol, label: this._i18n.t('Protocol')},
    ];
    this.dbInfo = this.dbInfoItems.reduce((pre, current) => {
      pre[current.name] = current.value;
      return pre;
    }, {});
  }

  generateConnCli() {
    // 密码占位，因为有 safe cli, 需要把密码隐藏，所以占位替换
    const passwordHolder = `@${this.dbInfo.password}@`;
    let cli = '';

    switch (this.protocol) {
      case 'mysql':
      case 'mariadb':
        cli = `mysql` +
          ` -u ${this.token.id}` +
          ` -p${passwordHolder}` +
          ` -h ${this.dbInfo.host}` +
          ` -P ${this.dbInfo.port}` +
          ` ${this.dbInfo.database}`;
        break;
      case 'postgresql':
        cli = `PGPASSWORD=${passwordHolder} psql` +
          ` -U ${this.token.id}` +
          ` -h ${this.dbInfo.host}` +
          ` -d ${this.dbInfo.database}` +
          ` -p ${this.dbInfo.port}`;
        break;
      default:
        cli = `Protocol '${this.dbInfo.protocol}' Not support now`;
    }
    this.cliSafe = cli.replace(passwordHolder, this.passwordMask);
    this.cli = cli.replace(passwordHolder, this.dbInfo.password);
  }

  startClient() {
    const data = {
      protocol: this.dbInfo.protocol,
      username: User.username,
      command: this.cli
    };
    const json = JSON.stringify(data);
    const b64 = window.btoa(json);
    const url = 'jms://' + b64;
    window.open(url);
  }

  showPassword($event) {
    $event.stopPropagation();
    if (this.passwordShow === this.passwordMask) {
      this.passwordShow = this.dbInfo.password;
    } else {
      this.passwordShow = this.passwordMask;
    }
  }

  async onCopySuccess(evt) {
    const msg = await this._i18n.t('Copied');
    this._toastr.success(msg);
  }
}
