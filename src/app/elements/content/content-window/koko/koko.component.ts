import {Component, Input, OnInit, ViewChild, ElementRef, Inject} from '@angular/core';
import {View, Account, TreeNode, Endpoint, Asset} from '@app/model';
import {LogService} from '@app/services';
import {HttpParams} from '@angular/common/http';


@Component({
  selector: 'elements-connector-koko',
  templateUrl: './koko.component.html',
  styleUrls: ['./koko.component.scss']
})
export class ElementConnectorKokoComponent implements OnInit {
  @Input() view: View;
  @ViewChild('terminal', {static: false}) iframe: ElementRef;

  iframeURL: any;
  asset: Asset;
  protocol: string;
  baseUrl: string;

  constructor(private _logger: LogService) {
  }

  ngOnInit() {
    const {asset, protocol, smartEndpoint} = this.view;
    this.asset = asset;
    this.protocol = protocol;
    const url = smartEndpoint.getUrl();
    this.baseUrl = `${url}/koko`;
    this.generateIframeURL();
  }

  generateIframeURL() {
    switch (this.view.connectMethod.value) {
      case 'web_sftp':
        this.generateFileManagerURL();
        break;
      default:
        this.generateNodeConnectUrl();
        break;
    }
  }

  setK8sParams(params) {
    Object.keys(this.view.k8sInfo).forEach(k => {
      const v = this.view.k8sInfo[k];
      if (v) {
        params[k] = this.view.k8sInfo[k];
      }
    });
  }

  generateNodeConnectUrl() {
    const params = {};

    params['disableautohash'] = this.view.getConnectOption('disableautohash');
    params['token'] = this.view.connectToken.id;
    if (this.view.k8sInfo) {
      this.setK8sParams(params);
    }

    params['_'] = Date.now().toString();
    const query = Object.entries(params)
      .map(([key, value]) => { return `${key}=${value}`; })
      .reduce((a, b) => { return `${a}&${b}`; });

    this.iframeURL = `${this.baseUrl}/connect/?` + query;
  }

  generateFileManagerURL() {
    this.iframeURL = `${this.baseUrl}/elfinder/sftp/?token=${this.view.connectToken.id}&asset=${this.asset.id}`;
  }
}
