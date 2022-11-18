import {Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import {LogService} from '@app/services';
import {TreeNode, Account} from '@app/model';
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
  sysUser: Account;
  protocol: string;
  public baseUrl: string;

  constructor(private _logger: LogService) {
  }

  ngOnInit() {
    const {node, protocol, account, smartEndpoint} = this.view;
    this.baseUrl = smartEndpoint.getUrl() ;
    this.node = node;
    this.sysUser = account;
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
    }
  }

  generateNodeURL() {
    this.iframeURL = `${this.baseUrl}/lion/perm-token/?token=${this.view.token}`;
  }

  generateTokenURL() {
    this.iframeURL = `${this.baseUrl}/lion/connect-token/?token=${this.view.token}`;
  }

  active() {
    this.el.nativeElement.focus();
  }
}
