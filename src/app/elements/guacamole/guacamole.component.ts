import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {HttpService, LogService} from '../../app.service';
import {DataStore, User} from '../../globals';
import {DomSanitizer} from '@angular/platform-browser';
import {environment} from '../../../environments/environment';
import {NavList} from '../../pages/control/control/control.component';

@Component({
  selector: 'elements-guacamole',
  templateUrl: './guacamole.component.html',
  styleUrls: ['./guacamole.component.scss']
})
export class ElementGuacamoleComponent implements OnInit {
  @Input() host: any;
  @Input() sysUser: any;
  @Input() remoteAppId: string;
  @Input() target: string;
  @Input() index: number;
  @ViewChild('rdp') el: ElementRef;
  registered = false;

  constructor(private sanitizer: DomSanitizer,
              private _http: HttpService,
              private _cookie: CookieService,
              private _logger: LogService) {
  }

  registerHost() {
    let action: any;
    if (this.remoteAppId) {
      action = this._http.guacamole_add_remote_app(User.id, this.remoteAppId, this.sysUser.username, this.sysUser.password);
    } else {
      action = this._http.guacamole_add_asset(User.id, this.host.id, this.sysUser.id, this.sysUser.username, this.sysUser.password);
    }
    action.subscribe(
      data => {
        const base = data.result;
        this.target = document.location.origin + '/guacamole/#/client/' + base + '?token=' + DataStore.guacamole_token;
        NavList.List[this.index].Rdp = this.el.nativeElement;
      },
      error => {
        if (!this.registered) {
          console.log('Register host error, register token then connect');
          this.registerToken();
        }
      }
    );
  }

  registerToken() {
    const now = new Date();
    const nowTime = now.getTime() / 1000;
    this.registered = true;
    this._http.get_guacamole_token(User.id, '').subscribe(
      data => {
        // /guacamole/client will redirect to http://guacamole/#/client
        DataStore.guacamole_token = data['authToken'];
        DataStore.guacamole_token_time = nowTime;
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
    if (this.target) {
      NavList.List[this.index].Rdp = this.el.nativeElement;
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

  Disconnect() {
    NavList.List[this.index].connected = false;
  }

  active() {
    this.el.nativeElement.focus();
  }

}
