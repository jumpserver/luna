import {Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import {LogService} from '@app/services';
import {TreeNode, SystemUser} from '@app/model';
import {View} from '@app/model';

@Component({
  selector: 'elements-connector-lion',
  templateUrl: './lion.component.html',
  styleUrls: ['./lion.component.scss']
})
export class ElementConnectorLionComponent implements OnInit {
  @Input() view: View;
  @ViewChild('terminal', {static: false}) el: ElementRef;
  iframeURL: any;
  node: TreeNode;
  sysUser: SystemUser;
  protocol: string;

  public baseUrl = `${document.location.origin}/lion`;

  constructor(private _logger: LogService) {
  }

  ngOnInit() {
    const {node, protocol, sysUser} = this.view;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
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
    if (this.view.type === 'remote_app' || this.view.type === 'application' ) {
      this.iframeURL = `${this.baseUrl}/?target_id=${this.node.id}&type=remoteapp&system_user_id=${this.sysUser.id}`;
    } else {
      this.iframeURL = `${this.baseUrl}/?target_id=${this.node.id}&type=${this.protocol}&system_user_id=${this.sysUser.id}`;
    }
  }

  generateMonitorURL() {
  }

  generateTokenURL() {
    this.iframeURL = `${this.baseUrl}/?token=${this.view.token}`;
  }

  active() {
    this.el.nativeElement.focus();
  }
}
