import {Component, Input, OnInit, ViewChild, ElementRef, Inject} from '@angular/core';
import {View, SystemUser, TreeNode} from '@app/model';
import {HttpService, LogService, SettingService, UUIDService} from '@app/services';
import {TranslateService} from '@ngx-translate/core';
import {DomSanitizer} from '@angular/platform-browser';


@Component({
  selector: 'elements-connector-koko',
  templateUrl: './koko.component.html',
  styleUrls: ['./koko.component.scss']
})
export class ElementConnectorKokoComponent implements OnInit {
  @Input() view: View;
  @ViewChild('terminal') iframe: ElementRef;

  iframeURL: any;
  node: TreeNode;
  sysUser: SystemUser;
  protocol: string;
  terminalID: any;

  constructor(private _uuid: UUIDService,
              private sanitizer: DomSanitizer,
              private _logger: LogService,
              private settingSvc: SettingService,
              private _http: HttpService,
              public translate: TranslateService ) {
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

    this.view.termComp = this;
    this.terminalID = Math.random().toString(36).substr(2);
    this._logger.debug('What is the iframe url: ', this.iframeURL);
  }

  generateNodeConnectUrl() {
    const baseUrl = `${document.location.origin}/koko/terminal`;
    switch (this.view.protocol) {
      case 'k8s':
        this.iframeURL = `${baseUrl}/?target_id=${this.node.id}&type=k8s_app&system_user_id=${this.sysUser.id}`;
        break;
      case 'mysql':
        this.iframeURL = `${baseUrl}/?target_id=${this.node.id}&type=database_app&system_user_id=${this.sysUser.id}`;
        break;
      default:
        this.iframeURL = `${baseUrl}/?target_id=${this.node.id}&type=asset&system_user_id=${this.sysUser.id}`;
        break;
    }
  }

  generateTokenURL()  {
    const tokenUrl = `${document.location.origin}/koko/token`;
    this.iframeURL = `${tokenUrl}/?target_id=${this.view.token}&type=token`;
  }

  generateFileManagerURL() {
    this.iframeURL = `/koko/elfinder/sftp/${this.node.id}/`;
  }

  listenEvent() {
    if (!this.iframeURL || this.iframeURL === 'about:blank') {
      return null;
    }
    const isIFrame = (input: HTMLElement | null): input is HTMLIFrameElement =>
      input !== null && input.tagName === 'IFRAME';
    const frame = document.getElementById(this.terminalID);
    if (isIFrame(frame) && frame.contentWindow) {
      frame.contentWindow.addEventListener('CLOSE', (e) => {
        this.view.connected = false;
      });
    }
  }

  reconnect() {
    const url = this.iframeURL;
    this.iframeURL = 'about:blank';
    setTimeout(() => {
      this.iframeURL = url;
    }, 10);
    this.view.connected = true;
  }

  sendCommand(data) {
    const isIFrame = (input: HTMLElement | null): input is HTMLIFrameElement =>
      input !== null && input.tagName === 'IFRAME';
    const frame = document.getElementById(this.terminalID);
    if (isIFrame(frame) && frame.contentWindow) {
      const iframeWindow: any = frame.contentWindow;
      iframeWindow.SendTerminalData(data.data);
    }
  }
}
