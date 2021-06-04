import {Injectable, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {CookieService} from 'ngx-cookie-service';
import {environment} from '@src/environments/environment';
import {DataStore, User, ProtocolConnectTypes} from '@app/globals';
import {HttpService} from './http';
import {LocalStorageService, LogService} from './share';
import {SettingService} from '@app/services/setting';


declare function unescape(s: string): string;


@Injectable()
export class AppService implements OnInit {
  // user:User = user  ;
  lang: string;

  constructor(private _http: HttpService,
              private _router: Router,
              private _cookie: CookieService,
              private _logger: LogService,
              private _settingSvc: SettingService,
              private _localStorage: LocalStorageService) {
    this.setLogLevel();
    this.checklogin();
  }

  public ngOnInit() {
  }

  setLogLevel() {
    // 设置logger level
    let logLevel = this._cookie.get('logLevel');
    if (!logLevel) {
        logLevel = environment.production ? '1' : '5';
    }
    this._logger.level = parseInt(logLevel, 10);
  }
  checklogin() {
    this._logger.debug('Check user auth');
    if (!DataStore.Path) {
      this._router.navigate(['FOF']);
    }

    if (User.logined) {
      if (document.location.pathname === '/login') {
        this._router.navigate(['']);
      } else {
        this._router.navigate([document.location.pathname]);
      }
      return;
    }
    this._http.getUserProfile().subscribe(
      user => {
        Object.assign(User, user);
        User.logined = true;
        const oldUserId = this._localStorage.get('user');
        if (oldUserId !== user.id ) {
          this._localStorage.set('guacamoleToken', null);
        }
        this._localStorage.set('user', user.id);
      },
      err => {
        // this._logger.error(err);
        User.logined = false;
        if (document.location.pathname !== '/luna/connect') {
          window.location.href = document.location.origin + '/core/auth/login/?next=' +
            encodeURI(document.location.pathname + document.location.search);
        }
        // this._router.navigate(['login']);
      },
    );
  }

  browser() {
    this._http.reportBrowser();
  }

  getQueryString(name) {
    const reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
    const r = window.location.search.substr(1).match(reg);
    if (r != null) {
      return unescape(r[2]);
    }
    return null;
  }

  getProtocolConnectTypes() {
    const xpackEnabled = this._settingSvc.globalSetting.XPACK_LICENSE_IS_VALID;
    const validTypes = {};
    for (const [protocol, types] of Object.entries(ProtocolConnectTypes)) {
      validTypes[protocol] = types.filter((tp) => {
        if (!xpackEnabled && tp.requireXPack) {
          return false;
        } else {
          return true;
        }
      });
    }
    return validTypes;
  }
}
