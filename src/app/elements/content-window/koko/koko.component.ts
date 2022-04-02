import {Component, Input, OnInit, ViewChild, ElementRef, Inject} from '@angular/core';
import {View, SystemUser, TreeNode, Endpoint} from '@app/model';
import {LogService} from '@app/services';


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
  sysUser: SystemUser;
  protocol: string;
  baseUrl: string;
  connectEndpoint: Endpoint;

  constructor(private _logger: LogService) {
  }

  ngOnInit() {
    const {node, sysUser, protocol, connectEndpoint} = this.view;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
    const proto = window.location.protocol;
    const port = connectEndpoint.getProtocolPort(proto);
    this.baseUrl = `${proto}://${connectEndpoint.host}:${port}/koko`;
    this.generateIframeURL();
  }

  generateIframeURL() {
    switch (this.view.connectFrom) {
      case 'node':
        this.generateNodeConnectUrl();
        break;
      case 'token':
        this.generateTokenURL();
        break;
      case 'fileManager':
        this.generateFileManagerURL();
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

  getFilteredField(field: string) {
    const filteredField = this.view.connectOptions.find(i => i.field === field);
    return filteredField;
  }

  generateNodeConnectUrl() {
    let type = this.view.protocol;
    const getFieldDisableAutoHash = this.getFilteredField('disableautohash');
    const automaticCompletion = getFieldDisableAutoHash && getFieldDisableAutoHash.value ? 1 : '';

    if (this.view.type === 'remote_app') {
      type = 'remoteapp';
    }

    if (this.node.meta.data.type !== 'k8s') {
      this.iframeURL = `${this.baseUrl}/terminal/?target_id=${this.node.id}` +
        `&type=${type}&system_user_id=${this.sysUser.id}` +
        `&disableautohash=${automaticCompletion}&_=${Date.now()}`;
      return;
    }

    const parentInfo = this.analysisId(this.node['parentInfo']);
    const pod = parentInfo['pod'];
    const appId = parentInfo['app_id'];
    const namespace = parentInfo['namespace'];
    const container = parentInfo['container'];
    const systemUserId = parentInfo['system_user_id'] || this.sysUser['id'];

    this.iframeURL = `${this.baseUrl}/terminal/` +
      `?target_id=${appId}&type=${type}` +
      `&system_user_id=${systemUserId}` +
      `&disableautohash=${automaticCompletion}` +
      `&_=${Date.now()}`;

    const identity = this.node.meta.data.identity;
    if (identity === 'container') {
      this.iframeURL += `&namespace=${namespace}&pod=${pod}` +
        `&container=${container}&disableautohash=${automaticCompletion}`;
    }
  }

  generateTokenURL() {
    const tokenUrl = `${this.baseUrl}/token`;
    this.iframeURL = `${tokenUrl}/?target_id=${this.view.token}&type=token&_=${Date.now()}`;
  }

  generateFileManagerURL() {
    this.iframeURL = `${this.baseUrl}/elfinder/sftp/${this.node.id}/?_=${Date.now()}`;
  }
}
