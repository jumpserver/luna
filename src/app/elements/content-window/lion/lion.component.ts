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
  public baseUrl: string;

  constructor(private _logger: LogService) {
  }

  ngOnInit() {
    const {node, protocol, sysUser, smartEndpoint} = this.view;
    this.baseUrl = smartEndpoint.getUrl();
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
    let type = this.protocol;
    if (this.view.type === 'remote_app' || this.view.type === 'application' ) {
      type = 'remoteapp';
    }
    this.iframeURL = `${this.baseUrl}/?target_id=${this.node.id}&type=${type}&system_user_id=${this.sysUser.id}&_=${Date.now()}`;
  }

  generateMonitorURL() {
  }

  generateTokenURL() {
    this.iframeURL = `${this.baseUrl}/?token=${this.view.token}&_=${Date.now()}`;
  }

  active() {
    this.el.nativeElement.focus();
  }
}
