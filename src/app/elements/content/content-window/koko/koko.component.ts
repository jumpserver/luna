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
    switch (this.view.connectFrom) {
      case 'fileManager':
        this.generateFileManagerURL();
        break;
      default:
        this.generateNodeConnectUrl();
        break;
    }
  }


  generateNodeConnectUrl() {
    const params = {};
    params['disableautohash'] = this.view.getConnectOption('disableautohash');
    params['connectToken'] = this.view.connectToken.id;
    params['_'] = Date.now().toString();

    const query = Object.entries(params)
      .map(([key, value]) => { return `${key}=${value}`; })
      .reduce((a, b) => { return `${a}&${b}`; });

    // Todo: K8S
    // if (this.asset.type === 'k8s' && this.node.meta.data.identity) {
    //   const k8sInfo = this.analysisId(this.node['parentInfo']);
    //   for (const [key, value] of Object.entries(k8sInfo)) {
    //     params.set(key, value.toString());
    //   }
    // }

    console.log('query', query);

    this.iframeURL = `${this.baseUrl}/connect/?` + query;
  }

  generateFileManagerURL() {
    this.iframeURL = `${this.baseUrl}/elfinder/sftp/${this.asset.id}/`;
  }
}
