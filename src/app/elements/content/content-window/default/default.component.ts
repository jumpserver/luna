import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { Asset, Endpoint, View } from '@app/model';
import { getSitePrefix, joinEndpointUrl, withSitePrefix } from '@app/utils/path';

@Component({
  standalone: false,
  selector: 'elements-connector-default',
  templateUrl: 'default.component.html',
  styleUrls: ['default.component.scss']
})
export class ElementConnectorDefaultComponent implements OnInit {
  @Input() view: View;
  @Input() connector: string;
  @ViewChild('terminal', { static: false }) el: ElementRef;
  iframeURL: string;
  baseUrl: string;
  asset: Asset;
  protocol: string;
  endpoint: Endpoint;

  constructor() {}

  ngOnInit() {
    const { asset, protocol, smartEndpoint } = this.view;
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
      case 'chen': {
        const params = new URLSearchParams({ token });
        const disableautohash = this.view.getConnectOption('disableautohash');
        const sitePrefix = getSitePrefix();

        if (disableautohash) {
          params.set('disableautohash', 'true');
        }

        if (sitePrefix) {
          params.set('site_prefix', sitePrefix);
        }

        return joinEndpointUrl(endpointUrl, withSitePrefix(`/chen/connect?${params.toString()}`));
      }
      case 'lion':
        return joinEndpointUrl(endpointUrl, withSitePrefix(`/lion/connect?token=${token}`));
      case 'default':
        return joinEndpointUrl(endpointUrl, withSitePrefix(`/koko/connect?token=${token}`));
      default:
        return '';
    }
  }
}
