import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {HttpService, LogService} from '@app/app.service';
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
  @ViewChild('rdpRef') el: ElementRef;
  registered = false;

  constructor(private sanitizer: DomSanitizer,
              private _http: HttpService,
              private _cookie: CookieService,
              private _logger: LogService) {
  }

  registerHost() {
    let action: any;
    console.log(this.sysUser);
    if (this.remoteAppId) {
      action = this._http.guacamoleAddRemoteApp(User.id, this.remoteAppId, this.sysUser.id, this.sysUser.username, this.sysUser.password);
    } else {
      action = this._http.guacamoleAddAsset(User.id, this.host.id, this.sysUser.id, this.sysUser.username, this.sysUser.password);
    }
    action.subscribe(
      data => {
        const base = data.result;
        this.target = document.location.origin + '/guacamole/#/client/' + base + '?token=' + DataStore.guacamoleToken;
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

    // if (!environment.production) {
    //   this.target = this._cookie.get('guacamole');
    //   NavList.List[this.index].Rdp = this.el.nativeElement;
    //   return null;
    // }
    this.registerHost();
  }

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  active() {
    this.el.nativeElement.focus();
  }

}
