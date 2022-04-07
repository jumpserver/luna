import {Component, OnInit, Input} from '@angular/core';
import {SystemUser, TreeNode, View} from '@app/model';

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
  sysUser: SystemUser;
  protocol: string;

  constructor() {
  }

  ngOnInit() {
    const {node, protocol, sysUser, connectEndpoint} = this.view;
    const proto = window.location.protocol;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
    this.baseUrl = `${proto}//${connectEndpoint.host}:${connectEndpoint.port}/omnidb/jumpserver`;
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
    this.iframeURL = `${this.baseUrl}/connect/workspace/?database_id=${this.node.id}` +
      `&system_user_id=${this.sysUser.id}&_=${Date.now()}`;
  }

  generateTokenURL() {
  }

  generateMonitorURL() {
  }
}
