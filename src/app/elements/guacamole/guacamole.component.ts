import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {HttpService, LogService, SettingService} from '@app/services';
import {DataStore, User} from '@app/globals';
import {DomSanitizer} from '@angular/platform-browser';
import {View} from '@app/model';

@Component({
  selector: 'elements-guacamole',
  templateUrl: './guacamole.component.html',
  styleUrls: ['./guacamole.component.scss']
})
export class ElementGuacamoleComponent implements OnInit {
  @Input() view: View;
  @Input() host: any;
  @Input() sysUser: any;
  @Input() remoteAppId: string;
  @Input() target: string;
  @Input() index: number;
  @Input() token: any;
  @ViewChild('rdpRef') el: ElementRef;
  registered = false;
  iframeWindow: any;
  idleTimeout: number;
  idleTTL = 1000 * 3600;
  isIdleTimeout = false;
  idleTimeoutMsg = 'Idle timeout, connection has been disconnected';

  constructor(private sanitizer: DomSanitizer,
              private _http: HttpService,
              private _cookie: CookieService,
              private settingSvc: SettingService,
              private _logger: LogService) {
    this.idleTTL = this.settingSvc.globalSetting.SECURITY_MAX_IDLE_TIME * 60 * 1000;
  }


  ngOnInit() {
    // /guacamole/api/tokens will redirect to http://guacamole/api/tokens
    // this.view.type = 'rdp';
    // /lion/?type=vnc&target_id=40c0d114-fbbe-412e-9429-23b9917764e3&system_user_id=b40fc7be-84ae-4a58-9551-c7372b4a25bc

    if (this.target) {
      return null;
    }
    const baseUrl = `${document.location.origin}/lion/`;
    if (this.host) {
      this.target = `${baseUrl}/?target_id=${this.host.id}&type=${this.view.type}&system_user_id=${this.sysUser.id}`;
    }
    if (this.token) {
      this.target = `${baseUrl}/?token=${this.token}`;
    }
  }

  setIdleTimeout() {
    this.iframeWindow = this.el.nativeElement.contentWindow;
    this.resetIdleTimeout();
    this.iframeWindow.onclick = () => this.resetIdleTimeout();
    this.iframeWindow.onkeyup = () => this.resetIdleTimeout();
  }

  resetIdleTimeout() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    // @ts-ignore
    this.idleTimeout = setTimeout(() => this.disconnect(), this.idleTTL);
  }

  disconnect() {
    this._logger.debug('Disconnect guacamole');
    this.target = '';
    this.isIdleTimeout = true;
  }

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // active() {
  //   this.el.nativeElement.focus();
  // }

}
