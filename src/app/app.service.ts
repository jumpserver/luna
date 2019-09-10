import {EventEmitter, Injectable, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {CookieService} from 'ngx-cookie-service';

import {DataStore, User, Browser, i18n} from './globals';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {NGXLogger} from 'ngx-logger';
import {SystemUser, GuacObjAddResp, TreeNode, User as _User, NavEvt, View} from './model';
import {environment} from '../environments/environment';
import * as UUID from 'uuid-js/lib/uuid.js';

declare function unescape(s: string): string;



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
    return this.http.get<_User>('/api/users/v1/profile/');
  }

  getMyGrantedAssets(keyword) {
    const url = `/api/perms/v1/users/assets/tree/?search=${keyword}`;
    return this.http.get<Array<TreeNode>>(url);
  }

  filterMyGrantedAssetsById(id: string) {
    const url = `/api/perms/v1/users/assets/tree/?id=${id}`;
    return this.http.get<Array<TreeNode>>(url);
  }

  getMyGrantedNodes(async: boolean, refresh?: boolean) {
    const cachePolicy = refresh ? '2' : '1';
    const syncUrl = `/api/perms/v1/users/nodes-with-assets/tree/?cache_policy=${cachePolicy}`;
    const asyncUrl = `/api/perms/v1/users/nodes/children-with-assets/tree/?cache_policy=${cachePolicy}`;
    const url = async ? asyncUrl : syncUrl;
    return this.http.get<Array<TreeNode>>(url);
  }

  getMyGrantedRemoteApps(id?: string) {
    let url = '/api/perms/v1/user/remote-apps/tree/';
    if (id) {
      url += `?id=${id}&only=1`;
    }
    return this.http.get<Array<TreeNode>>(url);
  }

  getMyAssetSystemUsers(assetId: string) {
    const url = `/api/v1/perms/users/assets/${assetId}/system-users/`;
    return this.http.get<Array<SystemUser>>(url);
  }

  refreshMyGrantedNodes() {
    return this.http.get<Array<TreeNode>>('/api/perms/v1/user/nodes-assets/tree/?cache_policy=2');
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
      .set('token', DataStore.guacamoleToken);
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
      .set('token', DataStore.guacamoleToken);
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
    const params = new HttpParams().set('q', q);
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
              private _cookie: CookieService,
              private _logger: LogService,
              private _localStorage: LocalStorageService) {
    this.setLogLevel();
    this.setLang();
    this.checklogin();
  }

  ngOnInit() {
  }

  setLogLevel() {
    // 设置logger level
    let logLevel = this._cookie.get('logLevel');
    if (!logLevel) {
        logLevel = environment.production ? '1' : '5';
    }
    this._logger.level = parseInt(logLevel, 10);
  }

  setLang() {
    let lang = this._cookie.get('lang');
    if (!lang) {
      lang = navigator.language;
    }
    lang = lang.substr(0, 2);
    this.lang = lang;

    if (lang !== 'en') {
      let url = `/luna/i18n/zh.json`;
      if (!environment.production) {
        url = `/assets/i18n/zh.json`;
      }
      this._http.get(url).subscribe(
        data => {
          this._localStorage.set('lang', JSON.stringify(data));
        },
        err => {
          this._logger.error('Load i18n file error: ', err.error);
        }
      );
    }
    const l = this._localStorage.get('lang');
    if (l) {
      try {
        const data = JSON.parse(l);
        Object.keys(data).forEach((k, _) => {
          i18n.set(k, data[k]);
        });
      } catch (e) {
        this._logger.error('Parse lang json failed');
      }
    }
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
        this._localStorage.set('user', user.id);
      },
      err => {
        // this._logger.error(err);
        User.logined = false;
        if (document.location.pathname !== '/luna/connect') {
          window.location.href = document.location.origin + '/users/login?next=' +
            document.location.pathname + document.location.search;
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
}

@Injectable()
export class UUIDService {
  constructor() {

  }

  gen() {
    return UUID.create()['hex'];
  }
}


@Injectable()
export class NavService {
  onNavClick: EventEmitter<NavEvt> = new EventEmitter<NavEvt>();

  constructor(private store: LocalStorageService) {}

  disconnectAllConnection() {
    const evt = new NavEvt('disconnectAll', '');
    this.onNavClick.emit(evt);
  }

  disconnectConnection() {
    const evt = new NavEvt('disconnect', '');
    this.onNavClick.emit(evt);
  }

  changeLang(value) {
    const evt = new NavEvt('changeLang', value);
    this.onNavClick.emit(evt);
  }

  get treeLoadAsync() {
    const value = this.store.get('LoadTreeAsync');
    return value === '1';
  }

  set treeLoadAsync(v: boolean) {
    const value = v ? '1' : '0';
    this.store.set('LoadTreeAsync', value);
  }

  get skipAllManualPassword() {
    const value = this.store.get('SkipAllManualPassword');
    return value === '1';
  }

  set skipAllManualPassword(v) {
    const value = v ? '1' : '0';
    this.store.set('SkipAllManualPassword', value);
  }
}

@Injectable()
export class TreeFilterService {
  onFilter: EventEmitter<string> = new EventEmitter<string>();

  filter(q: string) {
    this.onFilter.emit(q);
  }
}

@Injectable()
export class ViewService {
  viewList: Array<View> = [];
  currentView: View;
  num = 0;

  addView(view: View) {
    this.num += 1;
    view.id = 'View_' + this.num;
    this.viewList.push(view);
  }

  activeView(view: View) {
    this.viewList.forEach((v, k) => {
      v.active = v === view;
    });
    setTimeout(() => {
      const viewEl = document.getElementById(view.id);
      if (viewEl) {
        viewEl.scrollIntoView();
      }
    }, 100);
    this.currentView = view;
  }

  removeView(view: View) {
    const index = this.viewList.indexOf(view);
    this.viewList.splice(index, 1);
  }
}
