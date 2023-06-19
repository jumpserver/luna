import {Component, Input, OnInit} from '@angular/core';
import {Asset, View} from '@app/model';

@Component({
  selector: 'elements-connector-chen',
  templateUrl: './chen.component.html',
  styleUrls: ['./chen.component.scss']
})
export class ElementConnectorChenComponent implements OnInit {
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
    this.baseUrl = `${endpointUrl}/chen/connect`;
    this.generateIframeURL();
  }

  generateIframeURL() {
    if (this.iframeURL) {
      return null;
    }
    this.iframeURL = `${this.baseUrl}/?token=${this.view.connectToken.id}`;
  }
}
