import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {Asset, Endpoint, View} from '@app/model';

@Component({
  selector: 'elements-connector-default',
  templateUrl: './default.component.html',
  styleUrls: ['./default.component.scss']
})
export class ElementConnectorDefaultComponent implements OnInit {
  @Input() view: View;
  @Input() connector: String;
  @ViewChild('terminal', {static: false}) el: ElementRef;
  iframeURL: string;
  baseUrl: string;
  asset: Asset;
  protocol: string;
  endpoint: Endpoint;

  constructor() {
  }

  ngOnInit() {
    const {asset, protocol, smartEndpoint} = this.view;
    this.asset = asset;
    this.protocol = protocol;
    this.endpoint = smartEndpoint;
    this.iframeURL = this.generateIframeURL(asset, protocol);
  }

  active() {
    this.el.nativeElement.focus();
  }

  generateIframeURL(asset, protocol) {
    if (this.iframeURL) {
      return this.iframeURL;
    }
    const endpointUrl = this.endpoint.getUrl();
    const token = this.view.connectToken.id;
    switch (this.connector) {
      case 'chen':
        const url = `${endpointUrl}/chen/connect?token=${token}`;
        const disableautohash = this.view.getConnectOption('disableautohash');
        if (disableautohash) {
          return `${url}&disableautohash=true`;
        }
        return url;
      case 'lion':
        return `${endpointUrl}/lion/connect?token=${token}`;
      case 'default':
        return `${endpointUrl}/koko/connect?token=${token}`;
    }
  }
}
