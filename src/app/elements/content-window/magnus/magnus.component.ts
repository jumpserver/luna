import {Component, Input, OnInit} from '@angular/core';
import {View, SystemUser, TreeNode} from '@app/model';
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

  iframeURL: any;
  node: TreeNode;
  sysUser: SystemUser;
  protocol: string;
  cli: string;
  cliSafe: string;
  protocolPorts: object;
  dbInfoItems: Array<any>;
  dbInfo: any;
  globalSetting: any;
  loading = true;
  passwordDark = '******';
  passwordShow = '******';

  constructor(private _logger: LogService,
              private _http: HttpService,
              private _i18n: I18nService,
              private _toastr: ToastrService,
              private _settingSvc: SettingService
  ) {
    this.dbInfoItems = [
      {name: 'host', label: this._i18n.t('Host')},
      {name: 'port',  label: this._i18n.t('Port')},
      {name: 'username', label: this._i18n.t('Username')},
      {name: 'password',  label: this._i18n.t('Password')},
      {name: 'database', label: this._i18n.t('Database')},
      {name: 'protocol', label: this._i18n.t('Protocol')},
    ];
    this.dbInfo = {username: '', password: '', host: '', port: '', database: '', protocol: ''};
    this.globalSetting = this._settingSvc.globalSetting;
  }

  ngOnInit() {
    const {node, sysUser, protocol} = this.view;
    this.dbInfo.host = this.globalSetting.TERMINAL_MAGNUS_HOST;
    this.protocolPorts = {
      mysql: this.globalSetting.TERMINAL_MAGNUS_MYSQL_PORT,
      postgresql: this.globalSetting.TERMINAL_MAGNUS_POSTGRE_PORT
    };
    this.node = node;
    this.sysUser = sysUser;
    this.dbInfo.protocol = protocol;
    this.dbInfo.port = this.protocolPorts[protocol];
    this.dbInfo.database = node.meta.data.attrs.database;
    this.generateConnectCLI();
  }

  generateConnectCLI() {
    this._http.getConnectionToken(this.sysUser.id, '', this.node.id).then((token) => {
      this.dbInfo.username = token.id;
      this.dbInfo.password = token.secret;
      // 密码占位，因为有 safe cli, 需要把密码隐藏，所以占位替换
      const passwordHolder = `@${this.dbInfo.password}@`;
      let cli = '';

      switch (this.dbInfo.protocol) {
        case 'mysql':
        case 'mariadb':
          cli = `mysql
            -u ${token.id}
            -p${passwordHolder}
            -h ${this.dbInfo.host}
            -P ${this.dbInfo.port}
            ${this.dbInfo.database}
          `;
          break;
        case 'postgresql':
          cli = `PGPASSWORD=${passwordHolder} psql
            -U ${token.id}
            -h ${this.dbInfo.host}
            -d ${this.dbInfo.database}
            -p ${this.dbInfo.port}
          `;
          break;
        default:
          cli = `Protocol '${this.dbInfo.protocol}' Not support now`;
      }
      this.cliSafe = cli.replace(passwordHolder, this.passwordDark);
      this.cli = cli.replace(passwordHolder, this.dbInfo.password);
      this.loading = false;
    });
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
    if (this.passwordShow === this.passwordDark) {
      this.passwordShow = this.dbInfo.password;
    } else {
      this.passwordShow = this.passwordDark;
    }
  }

  async onCopySuccess(evt) {
    const msg = await this._i18n.t('Copied');
    this._toastr.success(msg);
  }
}
