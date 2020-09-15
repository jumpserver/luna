import {Component, Input, OnInit, ViewChild, ElementRef, AfterViewInit} from '@angular/core';
import {View} from '@app/model';
import {LogService, SettingService, UUIDService} from '@app/services';
import {TranslateService} from '@ngx-translate/core';
import {DomSanitizer} from '@angular/platform-browser';


@Component({
  selector: 'elements-ssh-term',
  templateUrl: './ssh-term.component.html',
  styleUrls: ['./ssh-term.component.scss']
})
export class ElementSshTermComponent implements OnInit {
  @Input() view: View;
  @Input() host: any;
  @Input() sysUser: any;
  @Input() token: string;
  @Input() shareRoomId: string;
  @ViewChild('terminal') iframe: ElementRef;

  target: any;
  terminalID: any;

  constructor(private _uuid: UUIDService,
              private sanitizer: DomSanitizer,
              private _logger: LogService,
              private settingSvc: SettingService,
              public translate: TranslateService ) {
  }

  ngOnInit() {
    // tslint:disable-next-line:max-line-length
      if (this.host) {
        switch (this.view.type) {
          case 'ssh':
            this.target =  this.trust(
              `${document.location.origin}/koko/terminal/?target_id=${this.host.id}&type=asset&system_user_id=${this.sysUser.id}`
            );
            break;
          case 'database':
            this.target =  this.trust(
              // tslint:disable-next-line:max-line-length
              `${document.location.origin}/koko/terminal/?target_id=${this.host.id}&type=database_app&system_user_id=${this.sysUser.id}`
            );
            break;
          case 'k8s':
            this.target =  this.trust(
              `${document.location.origin}/koko/terminal/?target_id=${this.host.id}&type=k8s_app&system_user_id=${this.sysUser.id}`
            );
            break;
          default:
            this.target =  this.trust(
              `${document.location.origin}/koko/terminal/?target_id=${this.host.id}&type=asset&system_user_id=${this.sysUser.id}`
            );
            break;
        }
      }
      if (this.shareRoomId) {
        this.target =  this.trust(
          `${document.location.origin}/koko/terminal/?target_id=${this.shareRoomId}&type=shareroom`
        );
      }
      if (this.token) {
        this.target =  this.trust(
          `${document.location.origin}/koko/terminal/?target_id=${this.token}&type=token`
        );
      }
      this.view.termComp = this;
      this.terminalID = Math.random().toString(36).substr(2);

  }

  listenEvent() {
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
    const url = this.target;
    this.target = this.trust('about:blank');
    setTimeout(() => {
      this.target = url;
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

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

}
