import {Component, OnInit, Input} from '@angular/core';
import {Asset, TreeNode, View} from '@app/model';

@Component({
  selector: 'elements-connector-omnidb',
  templateUrl: './omnidb.component.html',
  styleUrls: ['./omnidb.component.scss']
})
export class ElementConnectorOmnidbComponent implements OnInit {
  @Input() view: View;
  iframeURL: string;
  baseUrl: string;
  asset: Asset;
  protocol: string;

  constructor() {
  }

  ngOnInit() {
    const {asset, protocol, smartEndpoint} = this.view;
    this.asset = asset;
    this.protocol = protocol;
    const endpointUrl = smartEndpoint.getUrl();
    this.baseUrl = `${endpointUrl}/omnidb/jumpserver`;
    this.generateIframeURL();
  }

  generateIframeURL() {
    if (this.iframeURL) {
      return null;
    }
    this.iframeURL = `${this.baseUrl}/connect/workspace/?token=${this.view.connectToken}`;
  }
}
