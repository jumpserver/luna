import {Component, Input, OnInit, ViewChild, ElementRef, Inject} from '@angular/core';
import {View, SystemUser, TreeNode} from '@app/model';
import {HttpService, LogService, SettingService} from '@app/services';


@Component({
  selector: 'elements-connector-magnus',
  templateUrl: './magnus.component.html',
  styleUrls: ['./magnus.component.scss']
})
export class ElementConnectorMagnusComponent implements OnInit {
  @Input() view: View;
  @ViewChild('terminal', {static: false}) iframe: ElementRef;

  iframeURL: any;
  node: TreeNode;
  sysUser: SystemUser;
  protocol: string;
  username: string;
  password: string;
  host: string;
  port: number = 33060;
  cli: string;
  protocolPorts: object;

  constructor(private _logger: LogService,
              private _http: HttpService,
              private _settingSvc: SettingService
  ) {
  }

  ngOnInit() {
    const {node, sysUser, protocol} = this.view;
    this.host = this._settingSvc.globalSetting.TERMINAL_MAGNUS_HOST;
    this.protocolPorts = {
      mysql: this._settingSvc.globalSetting.TERMINAL_MAGNUS_MYSQL_PORT,
      postgresql: this._settingSvc.globalSetting.TERMINAL_MAGNUS_POSTGRE_PORT
    };
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
    this.port = this.protocolPorts[protocol];
    this.generateConnectCLI();
  }

  generateConnectCLI() {
    this._http.getConnectionToken(this.sysUser.id, '', this.node.id).then((token) => {
      this.username = token.id;
      this.password = token.secret;

      switch (this.protocol) {
        case 'mysql':
        case 'mariadb':
          this.cli = `$ mysql -u${token.id} -p${token.secret} -hjumpserver-test.fit2cloud.com -P${this.port}`;
          break;
        case 'postgresql':
          this.cli = `$ psql -U ${token.id} -h jumpserver-test.fit2cloud.com -p ${this.port}\n Password: ${token.secret}`;
          break;
        default:
          this.cli = `Protocol '${this.protocol}' Not support now`;
      }
    });
  }
}
