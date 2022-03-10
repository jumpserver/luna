import {Component, Input, OnInit, ViewChild, ElementRef, Inject} from '@angular/core';
import {View, SystemUser, TreeNode} from '@app/model';
import {HttpService, LogService} from '@app/services';


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
  cli: string;

  constructor(private _logger: LogService,
              private _http: HttpService
  ) {
  }

  ngOnInit() {
    const {node, sysUser, protocol} = this.view;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
    this.generateConnectCLI();
  }

  generateConnectCLI() {
    this._http.getConnectionToken(this.sysUser.id, '', this.node.id).then((token) => {
      switch (this.protocol) {
        case 'mysql':
        case 'mariadb':
          const port = this.protocol === 'mysql' ? 33060 : 33061;
          this.cli = `$ mysql -u${token.id} -p${token.secret} -hjumpserver-test.fit2cloud.com -P${port}`;
          break;
        case 'postgresql':
          this.cli = `$ psql -U ${token.id} -h jumpserver-test.fit2cloud.com -p 54320 \n password: ${token.secret}`;
          break;
        default:
          this.cli = `Protocol '${this.protocol}' Not support now`;
      }
    });
  }
}
