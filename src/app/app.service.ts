/**
 * 后台控制
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Injectable, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {CookieService} from 'ngx-cookie-service';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import {DataStore, User, Browser, i18n} from './globals';
import {environment} from '../environments/environment';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {NGXLogger} from 'ngx-logger';
import * as UUID from 'uuid-js/lib/uuid.js';

declare function unescape(s: string): string;

class GuacObjAddResp {
  code: number;
  result: string;
}

@Injectable()
export class HttpService {
  headers = new HttpHeaders();

  constructor(private http: HttpClient) {
  }

  get(url: string, options?: any) {
    return this.http.get(url, options);
  }

  post(url: string, options?: any) {
    return this.http.post(url, options);
  }

  put(url: string, options?: any) {
    return this.http.put(url, options);
  }

  delete(url: string, options?: any) {
    return this.http.delete(url, options);
  }

  patch(url: string, options?: any) {
    return this.http.patch(url, options);
  }

  head(url: string, options?: any) {
    return this.http.head(url, options);
  }

  options(url: string, options?: any) {
    return this.http.options(url, options);
  }

  reportBrowser() {
    return this.http.post('/api/browser', JSON.stringify(Browser));
  }

  checkLogin(user: any) {
    return this.http.post('/api/checklogin', user);
  }

  getUserProfile() {
    return this.http.get('/api/users/v1/profile/');
  }

  getMyGrantedNodes() {
    return this.http.get<Array<Node>>('/api/perms/v1/users/nodes-with-assets/tree/?cache_policy=1');
  }

  getMyGrantedRemoteApps() {
    return this.http.get<Array<Node>>('/api/perms/v1/user/remote-apps/tree/');
  }

  refreshMyGrantedNodes() {
    return this.http.get<Array<Node>>('/api/perms/v1/users/nodes-with-assets/tree/?cache_policy=2');
  }

  getGuacamoleToken(user_id: string, authToken: string) {
    const body = new HttpParams()
      .set('username', user_id)
      .set('password', 'jumpserver')
      .set('asset_token', authToken);
//  {
// "authToken": "xxxxxxx",
// "username": "xxxxxx",
// "dataSource": "jumpserver",
// "availableDataSources":[
// "jumpserver"
// ]
// }
    return this.http.post('/guacamole/api/tokens',
      body.toString(),
      {headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded')});
  }

  guacamoleAddAsset(userId: string, assetId: string, systemUserId: string, systemUserUsername?: string, systemUserPassword?: string) {
    let params = new HttpParams()
      .set('user_id', userId)
      .set('asset_id', assetId)
      .set('system_user_id', systemUserId)
      .set('token', DataStore.guacamole_token);
    let body = new HttpParams();
    if (systemUserUsername && systemUserPassword) {
      systemUserUsername = btoa(systemUserUsername);
      systemUserPassword = btoa(systemUserPassword);
      body = body.set('username', systemUserUsername).set('password', systemUserPassword);
    }
    const solution = localStorage.getItem('rdpSolution') || 'Auto';
    if (solution !== 'Auto') {
      const width = solution.split('x')[0];
      const height = solution.split('x')[1];
      params = params.set('width', width).set('height', height);
    }

    return this.http.post<GuacObjAddResp>(
      '/guacamole/api/session/ext/jumpserver/asset/add',
      body.toString(),
      {
        headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded'),
        params: params
      }
    );
  }

  guacamoleAddRemoteApp(userId: string, remoteAppId: string, systemUserUsername?: string, systemUserPassword?: string) {
    let params = new HttpParams()
      .set('user_id', userId)
      .set('remote_app_id', remoteAppId)
      .set('token', DataStore.guacamole_token);
    let body = new HttpParams();
    if (systemUserUsername && systemUserPassword) {
      systemUserUsername = btoa(systemUserUsername);
      systemUserPassword = btoa(systemUserPassword);
      body = body.set('username', systemUserUsername).set('password', systemUserPassword);
    }
    const solution = localStorage.getItem('rdpSolution') || 'Auto';
    if (solution !== 'Auto') {
      const width = solution.split('x')[0];
      const height = solution.split('x')[1];
      params = params.set('width', width).set('height', height);
    }

    return this.http.post<GuacObjAddResp>(
      '/guacamole/api/session/ext/jumpserver/remote-app/add',
      body.toString(),
      {
        headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded'),
        params: params
      }
    );
  }

  guacamoleTokenAddAsset(assetToken: string, token: string) {
    let params = new HttpParams()
      .set('asset_token', assetToken)
      .set('token', token);
    const solution = localStorage.getItem('rdpSolution') || 'Auto';
    if (solution !== 'Auto') {
      const width = solution.split('x')[0];
      const height = solution.split('x')[1];
      params = params.set('width', width).set('height', height);
    }
    return this.http.get(
      '/guacamole/api/ext/jumpserver/asset/token/add',
      {
        headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded'),
        params: params
      }
    );
  }

  search(q: string) {
    const params = new HttpParams()
      .set('q', q);
    return this.http.get('/api/search', {params: params});
  }

  getReplay(token: string) {
    return this.http.get('/api/terminal/v1/sessions/' + token + '/replay');
  }

  // get_replay_json(token: string) {
  //   return this.http.get('/api/terminal/v2/sessions/' + token + '/replay');
  // }

  getReplayData(src: string) {
    return this.http.get(src);
  }

  getUserIdFromToken(token: string) {
    const params = new HttpParams()
      .set('user-only', '1')
      .set('token', token);
    return this.http.get('/api/users/v1/connection-token/', {params: params});
  }

}

@Injectable()
export class LogService {
  level: number;

  constructor(private _logger: NGXLogger) {
    // 0.- Level.OFF
    // 1.- Level.ERROR
    // 2.- Level.WARN
    // 3.- Level.INFO
    // 4.- Level.DEBUG
    // 5.- Level.LOG
    this.level = 4;
  }

  log(message: any, ...additional: any[]) {
    if (this.level > 4) {
      this._logger.log(message, ...additional);
    }
  }

  debug(message: any, ...additional: any[]) {
    if (this.level > 3) {
      this._logger.debug(message, ...additional);
    }
  }

  info(message: any, ...additional: any[]) {
    if (this.level > 2) {
      this._logger.info(message, ...additional);
    }
  }

  warn(message: any, ...additional: any[]) {
    if (this.level > 1) {
      this._logger.warn(message, ...additional);
    }
  }

  error(message: any, ...additional: any[]) {
    if (this.level > 0) {
      this._logger.error(message, ...additional);
    }
  }

}

@Injectable()
export class LocalStorageService {
  constructor() {

  }

  get(key: string): string {
    return localStorage.getItem(key);
  }

  set(key: string, value: any) {
    return localStorage.setItem(key, value);
  }

  delete(key: string) {
    return localStorage.removeItem(key);
  }
}

@Injectable()
export class AppService implements OnInit {
  // user:User = user  ;
  lang: string;

  constructor(private _http: HttpService,
              private _router: Router,
              private _logger: LogService,
              private _cookie: CookieService,
              private _localStorage: LocalStorageService) {
    if (this._cookie.get('loglevel')) {
      // 0.- Level.OFF
      // 1.- Level.ERROR
      // 2.- Level.WARN
      // 3.- Level.INFO
      // 4.- Level.DEBUG
      // 5.- Level.LOG
      this._logger.level = parseInt(this._cookie.get('loglevel'), 10);
      // this._logger.debug('Your debug stuff');
      // this._logger.info('An info');
      // this._logger.warn('Take care ');
      // this._logger.error('Too late !');
      // this._logger.log('log !');
    } else {
      this._cookie.set('loglevel', '0', 99, '/', document.domain);
      // this._logger.level = parseInt(Cookie.getCookie('loglevel'));
      this._logger.level = 0;
    }

    // if (environment.production) {
      this._logger.level = 2;
      this.checklogin();
    // }

    if (this._cookie.get('lang')) {
      this.lang = this._cookie.get('lang');
    } else {
      this.lang = window.navigator.languages ? window.navigator.languages[0] : 'cn';
      this._cookie.set('lang', this.lang);
    }

    if (this.lang !== 'en') {
      this._http.get('/luna/i18n/' + this.lang + '.json').subscribe(
        data => {
          this._localStorage.set('lang', JSON.stringify(data));
        },
        err => {
        }
      );
    }
    const l = this._localStorage.get('lang');
    if (l) {
      const data = JSON.parse(l);
      Object.keys(data).forEach((k, _) => {
        i18n.set(k, data[k]);
      });
    }
  }

  ngOnInit() {
  }

  checklogin() {
    this._logger.log('service.ts:AppService,checklogin');
    if (DataStore.Path) {
      if (document.location.pathname === '/luna/connect') {
      } else {
        if (User.logined) {
          if (document.location.pathname === '/login') {
            this._router.navigate(['']);
          } else {
            this._router.navigate([document.location.pathname]);
          }
          // jQuery('angular2').show();
        } else {
          this._http.getUserProfile()
            .subscribe(
              data => {
                User.id = data['id'];
                User.name = data['name'];
                User.username = data['username'];
                User.email = data['email'];
                User.is_active = data['is_active'];
                User.is_superuser = data['is_superuser'];
                User.role = data['role'];
                // User.groups = data['groups'];
                User.wechat = data['wechat'];
                User.comment = data['comment'];
                User.date_expired = data['date_expired'];
                if (data['phone']) {
                  User.phone = data['phone'].toString();
                }
                User.logined = data['logined'];
                this._logger.debug(User);
                this._localStorage.set('user', data['id']);
              },
              err => {
                // this._logger.error(err);
                User.logined = false;
                window.location.href = document.location.origin + '/users/login?next=' +
                  document.location.pathname + document.location.search;
                // this._router.navigate(['login']);
              },
            );
        }
      }
    } else {
      this._router.navigate(['FOF']);
      // jQuery('angular2').show();
    }
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
}

@Injectable()
export class UUIDService {
  constructor() {

  }

  gen() {
    return UUID.create()['hex'];
  }
}

