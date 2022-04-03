import {Component, Input, OnInit} from '@angular/core';
import {View, SystemUser, TreeNode} from '@app/model';
import {HttpService, I18nService, LogService, SettingService} from '@app/services';
import {User} from '@app/globals';
import {ToastrService} from 'ngx-toastr';


@Component({
  selector: 'elements-connector-sshClient',
  templateUrl: './sshClient.component.html',
  styleUrls: ['./sshClient.component.scss']
})
export class ElementConnectorSshClientComponent implements OnInit {
  @Input() view: View;

  node: TreeNode;
  sysUser: SystemUser;
  protocol: string;
  protocols: string;
  name: string;
  cli: string;
  cliSafe: string;
  sshInfoItems: Array<any>;
  sshInfo: any;
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
    const {node, sysUser, protocol} = this.view;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
    this.protocols = this.node.meta.data.protocols.join(', ');
    const oriHost = this.node.meta.data.ip;
    this.name = `${this.node.name}(${oriHost})`;
    this.token = await this._http.getConnectionToken(this.sysUser.id, this.node.id, '');
    this.loading = false;
    this.setSSHInfo();
    this.generateConnCli();
  }

  setSSHInfo() {
    this.sshInfoItems = [
      {name: 'name', value: this.name, label: this._i18n.t('Name')},
      {name: 'host', value:  this.globalSetting.TERMINAL_KOKO_HOST, label: this._i18n.t('Host')},
      {name: 'port', value: this.globalSetting.TERMINAL_KOKO_SSH_PORT,  label: this._i18n.t('Port')},
      {name: 'username', value: `JMS-${this.token.id}`, label: this._i18n.t('Username')},
      {name: 'password', value: this.token.secret,  label: this._i18n.t('Password')},
      {name: 'protocol', value: this.protocol, label: this._i18n.t('Protocol')},
    ];
    this.sshInfo = this.sshInfoItems.reduce((pre, current) => {
      pre[current.name] = current.value;
      return pre;
    }, {});
  }

  generateConnCli() {
    // 密码占位，因为有 safe cli, 需要把密码隐藏，所以占位替换
    const passwordHolder = `@${this.sshInfo.password}@`;
    let cli = '';
    console.log('this.protocol', this.protocol)
    switch (this.protocol) {
      case 'ssh':
        cli = `ssh ${this.sshInfo.username}@${this.sshInfo.host}` +
          ` -P ${passwordHolder}` +
          ` -p ${this.sshInfo.port}`;
        break;
      default:
        cli = `Protocol '${this.protocol}' Not support now`;
    }
    this.cliSafe = cli.replace(passwordHolder, this.passwordMask);
    this.cli = cli.replace(passwordHolder, this.sshInfo.password);
  }

  startClient() {
    const token = JSON.stringify({
      'ip': this.sshInfo.host,
      'port': this.sshInfo.port,
      'username': this.sshInfo.username,
      'password': this.sshInfo.password
    });
    const data = {
      protocol: this.protocol,
      username: User.username,
      token: token
    };
    const json = JSON.stringify(data);
    const b64 = window.btoa(json);
    const url = 'jms://' + b64;
    window.open(url);
  }

  showPassword($event) {
    $event.stopPropagation();
    if (this.passwordShow === this.passwordMask) {
      this.passwordShow = this.sshInfo.password;
    } else {
      this.passwordShow = this.passwordMask;
    }
  }

  async onCopySuccess(evt) {
    const msg = await this._i18n.t('Copied');
    this._toastr.success(msg);
  }
}
