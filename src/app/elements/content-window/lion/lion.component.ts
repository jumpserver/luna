import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {HttpService, LogService, SettingService} from '@app/services';
import {TreeNode, SystemUser} from '@app/model';
import {DomSanitizer} from '@angular/platform-browser';
import {View} from '@app/model';

@Component({
  selector: 'elements-connector-lion',
  templateUrl: './lion.component.html',
  styleUrls: ['./lion.component.scss']
})
export class ElementConnectorLionComponent implements OnInit {
  @Input() view: View;
  @ViewChild('rdpRef') el: ElementRef;
  registered = false;
  iframeWindow: any;
  terminalID: any;
  iframeURL: any;
  node: TreeNode;
  sysUser: SystemUser;
  protocol: string;

  public baseUrl = `${document.location.origin}/lion`;

  constructor(private sanitizer: DomSanitizer,
              private _http: HttpService,
              private _cookie: CookieService,
              private settingSvc: SettingService,
              private _logger: LogService) {
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

  ngOnInit() {
    const {node, protocol, sysUser} = this.view;
    this.node = node;
    this.sysUser = sysUser;
    this.protocol = protocol;
    this.generateIframeURL();
  }

  generateIframeURL() {
    if (this.iframeURL) {
      return null;
    }
    switch (this.view.connectFrom) {
      case 'node':
        this.generateNodeURL();
        break;
      case 'token':
        this.generateTokenURL();
        break;
      case 'monitor':
        this.generateMonitorURL();
        break;
    }
  }

  generateNodeURL() {
    if (this.view.type === 'remote_app') {
      this.iframeURL = `${this.baseUrl}/?target_id=${this.node.id}&type=remote_app&system_user_id=${this.sysUser.id}`;
    } else {
      this.iframeURL = `${this.baseUrl}/?target_id=${this.node.id}&type=${this.protocol}&system_user_id=${this.sysUser.id}`;
    }
  }

  generateMonitorURL() {
  }

  generateTokenURL() {
    this.iframeURL = `${this.baseUrl}/?token=${this.view.token}`;
  }

  active() {
    this.el.nativeElement.focus();
  }

}
