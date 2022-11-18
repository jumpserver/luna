import {Component, OnInit, Input} from '@angular/core';
import {Account, TreeNode, View} from '@app/model';

@Component({
  selector: 'elements-connector-omnidb',
  templateUrl: './omnidb.component.html',
  styleUrls: ['./omnidb.component.scss']
})
export class ElementConnectorOmnidbComponent implements OnInit {
  @Input() view: View;
  iframeURL: string;
  baseUrl: string;
  node: TreeNode;
  sysUser: Account;
  protocol: string;

  constructor() {
  }

  ngOnInit() {
    const {node, protocol, account, smartEndpoint} = this.view;
    this.node = node;
    this.sysUser = account;
    this.protocol = protocol;
    const url = smartEndpoint.getUrl();
    this.baseUrl = `${url}/omnidb/jumpserver`;
    this.generateIframeURL();
  }

  generateIframeURL() {
    if (this.iframeURL) {
      return null;
    }
    switch (this.view.connectFrom) {
      case 'node':
        this.generateNodeURL();
        break;
      case 'token':
        this.generateTokenURL();
        break;
      case 'monitor':
        this.generateMonitorURL();
        break;
    }
  }

  generateNodeURL() {
    this.iframeURL = `${this.baseUrl}/connect/workspace/?perm_token=${this.view.token}`;
  }

  generateTokenURL() {
  }

  generateMonitorURL() {
  }
}
