import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {Asset, Endpoint, View} from '@app/model';
import {joinEndpointUrl} from '@app/utils/path';
// 多子目录方案（保留备用）：site prefix 相关工具
// import { getSitePrefix, joinEndpointUrl, withSitePrefix } from '@app/utils/path';

@Component({
  standalone: false,
  selector: 'elements-connector-default',
  templateUrl: 'default.component.html',
  styleUrls: ['default.component.scss']
})
export class ElementConnectorDefaultComponent implements OnInit {
  @Input() view: View;
  @Input() connector: string;
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

  // dev 方案（当前生效）
  generateIframeURL(asset, protocol) {
    if (this.iframeURL) {
      return this.iframeURL;
    }
    const endpointUrl = this.endpoint.getUrl();
    const token = this.view.connectToken.id;
    switch (this.connector) {
      case 'chen':
        const url = joinEndpointUrl(endpointUrl, `/chen/connect?token=${token}`);
        const disableautohash = this.view.getConnectOption('disableautohash');
        if (disableautohash) {
          return `${url}&disableautohash=true`;
        }
        return url;
      case 'lion':
        return joinEndpointUrl(endpointUrl, `/lion/connect?token=${token}`);
      case 'default':
        return joinEndpointUrl(endpointUrl, `/koko/connect?token=${token}`);
    }
  }

  // 多子目录方案（保留备用）：site prefix + URLSearchParams 重写
  // generateIframeURL(asset, protocol) {
  //   if (this.iframeURL) {
  //     return this.iframeURL;
  //   }
  //   const endpointUrl = this.endpoint.getUrl();
  //   const token = this.view.connectToken.id;
  //
  //   switch (this.connector) {
  //     case 'chen': {
  //       const params = new URLSearchParams({ token });
  //       const disableautohash = this.view.getConnectOption('disableautohash');
  //       const sitePrefix = getSitePrefix();
  //
  //       if (disableautohash) {
  //         params.set('disableautohash', 'true');
  //       }
  //
  //       if (sitePrefix) {
  //         params.set('site_prefix', sitePrefix);
  //       }
  //
  //       return joinEndpointUrl(endpointUrl, withSitePrefix(`/chen/connect?${params.toString()}`));
  //     }
  //     case 'lion':
  //       return joinEndpointUrl(endpointUrl, withSitePrefix(`/lion/connect?token=${token}`));
  //     case 'default':
  //       return joinEndpointUrl(endpointUrl, withSitePrefix(`/koko/connect?token=${token}`));
  //     default:
  //       return '';
  //   }
  // }
}
