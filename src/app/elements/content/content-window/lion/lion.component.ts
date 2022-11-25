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
    this.iframeURL = `${this.baseUrl}/lion/connect/?token=${this.view.token}`;
  }

  active() {
    this.el.nativeElement.focus();
  }
}
