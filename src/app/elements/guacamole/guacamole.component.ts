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

  registerHost() {
    let action: any;
    if (this.remoteAppId) {
      action = this._http.guacamoleAddRemoteApp(User.id, this.remoteAppId, this.sysUser.id, this.sysUser.username, this.sysUser.password);
    } else if (this.token) {
      const now = new Date();
      const nowTime = now.getTime() / 1000;
      this._http.getGuacamoleToken(this.token, this.token).subscribe(
        data => {
          // /guacamole/client will redirect to http://guacamole/#/client
          DataStore.guacamoleToken = data['authToken'];
          DataStore.guacamoleTokenTime = nowTime;
          action = this._http.guacamoleTokenAddAsset(this.token).subscribe(
            data2 => {
              const base = data2['result'];
              this.target = document.location.origin + '/guacamole/#/client/' + base + '?token=' + DataStore.guacamoleToken;
              setTimeout(() => this.setIdleTimeout(), 500);
            },
            error => {
              if (!this.registered) {
                this._logger.debug('Register host error, register token then connect');
                this.registerToken();
              }
            }
          );
        },
        error => {
          this._logger.error(error);
          return null;
        });
    } else {
      action = this._http.guacamoleAddAsset(User.id, this.host.id, this.sysUser.id, this.sysUser.username, this.sysUser.password);
    }
    action.subscribe(
      data => {
        const base = data.result;
        this.target = document.location.origin + '/guacamole/#/client/' + base + '?token=' + DataStore.guacamoleToken;
        setTimeout(() => this.setIdleTimeout(), 500);
      },
      error => {
        if (!this.registered) {
          this._logger.debug('Register host error, register token then connect');
          this.registerToken();
        }
      }
    );
  }

  registerToken() {
    const now = new Date();
    const nowTime = now.getTime() / 1000;
    this.registered = true;
    this._logger.debug('User id is', User.id);
    this._http.getGuacamoleToken(User.id, '').subscribe(
      data => {
        // /guacamole/client will redirect to http://guacamole/#/client
        DataStore.guacamoleToken = data['authToken'];
        DataStore.guacamoleTokenTime = nowTime;
        this.registerHost();
      },
      error => {
        this._logger.error(error);
        return null;
      }
    );
  }

  ngOnInit() {
    // /guacamole/api/tokens will redirect to http://guacamole/api/tokens
    this.view.type = 'rdp';
    if (this.target) {
      return null;
    }
    this.registerHost();
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

  active() {
    this.el.nativeElement.focus();
  }

}
