import {Component, Input, OnInit, ViewChild, ElementRef, Inject} from '@angular/core';
import {View, Account, TreeNode, Endpoint} from '@app/model';
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
  node: TreeNode;
  sysUser: Account;
  protocol: string;
  baseUrl: string;

  constructor(private _logger: LogService) {
  }

  ngOnInit() {
    const {node, account, protocol, smartEndpoint} = this.view;
    this.node = node;
    this.sysUser = account;
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

  analysisId(idStr) {
    const idObject = {};
    idStr = idStr.split('&');
    for (let i = 0; i < idStr.length; i++) {
      idObject[idStr[i].split('=')[0]] = (idStr[i].split('=')[1]);
    }
    return idObject;
  }


  generateNodeConnectUrl() {
    const params = new HttpParams();
    params.set('disableautohash', this.view.getConnectOption('disableautohash'));
    params.set('token', this.view.token);
    params.set('_', Date.now().toString());

    if (this.node.meta.data.type === 'k8s' && this.node.meta.data.identity) {
      const k8sInfo = this.analysisId(this.node['parentInfo']);
      for (const [key, value] of Object.entries(k8sInfo)) {
        params.set(key, value.toString());
      }
    }

    this.iframeURL = `${this.baseUrl}/connect/?` + params.toString();
  }

  generateFileManagerURL() {
    this.iframeURL = `${this.baseUrl}/elfinder/sftp/${this.node.id}/`;
  }
}
