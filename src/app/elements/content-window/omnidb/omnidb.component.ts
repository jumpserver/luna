import {Component, OnInit, Input} from '@angular/core';
import {View} from '@app/model';

@Component({
  selector: 'elements-connector-omnidb',
  templateUrl: './omnidb.component.html',
  styleUrls: ['./omnidb.component.scss']
})
export class ElementConnectorOmnidbComponent implements OnInit {
  @Input() view: View;
  iframeURL: string;

  constructor() {
  }

  ngOnInit() {
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
    const baseURL = `${document.location.origin}/omnidb/jumpserver`;
    const app = this.view.node;
    const sysUser = this.view.sysUser;
    this.iframeURL = `${baseURL}/connect/workspace/?database_id=${app.id}&system_user_id=${sysUser.id}`;
  }

  generateTokenURL() {
  }

  generateMonitorURL() {
  }
}
