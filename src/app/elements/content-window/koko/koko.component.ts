import {Component, Input, OnInit, ViewChild, ElementRef, Inject} from '@angular/core';
import {View, SystemUser, TreeNode} from '@app/model';
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

  constructor(private _logger: LogService) {
  }

  ngOnInit() {
    const {node, sysUser, protocol} = this.view;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
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

  AnalysisId(idStr) {
    var idObject = new Object();
    var idStr = idStr.split("&");
    for (var i = 0; i < idStr.length; i++) {
      idObject[idStr[i].split("=")[0]] = (idStr[i].split("=")[1]);
    }
    return idObject;
  }

  generateNodeConnectUrl() {
    const baseUrl = `${document.location.origin}/koko/terminal`;
    let type = this.view.protocol;

    if (this.view.type === 'remote_app') {
      type = 'remoteapp';
    }
    if (this.node.meta.data.type === 'k8s') {
      const identity = this.node.meta.data.identity
      const parentInfo = this.AnalysisId(this.node['parentInfo'])
      const pod = parentInfo['pod']
      const appId = parentInfo['app_id']
      const namespace = parentInfo['namespace']
      const container = parentInfo['container']
      const SystemUserId = parentInfo['system_user_id'] ? parentInfo['system_user_id'] : this.sysUser['id']
      this.iframeURL = `${baseUrl}/?target_id=${appId}&type=${type}` + `&system_user_id=${SystemUserId}&_=${Date.now()}`
       if (identity === 'container') {
        this.iframeURL = this.iframeURL + `&namespace=${namespace}` + `&pod=${pod}` + `&container=${container}`
      }
    } else {
       this.iframeURL = `${baseUrl}/?target_id=${this.node.id}&type=${type}&system_user_id=${this.sysUser.id}&_=${Date.now()}`;
    }
  }

  generateTokenURL() {
    const tokenUrl = `${document.location.origin}/koko/token`;
    this.iframeURL = `${tokenUrl}/?target_id=${this.view.token}&type=token&_=${Date.now()}`;
  }

  generateFileManagerURL() {
    this.iframeURL = `/koko/elfinder/sftp/${this.node.id}/?_=${Date.now()}`;
  }
}
