import {Component, OnInit, Input} from '@angular/core';
import {TreeNode, View} from '@app/model';

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
  protocol: string;

  constructor() {
  }

  ngOnInit() {
    const {node, protocol, smartEndpoint} = this.view;
    this.node = node;
    this.protocol = protocol;
    const endpointUrl = smartEndpoint.getUrl();
    this.baseUrl = `${endpointUrl}/omnidb/jumpserver`;
    this.generateIframeURL();
  }

  generateIframeURL() {
    if (this.iframeURL) {
      return null;
    }
    this.iframeURL = `${this.baseUrl}/connect/workspace/?token=${this.view.token}`;
  }
}
