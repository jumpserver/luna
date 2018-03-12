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
import {HostGroup} from './ControlPage/cleftbar/cleftbar.component';
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

  report_browser() {
    return this.http.post('/api/browser', JSON.stringify(Browser));
  }

  check_login(user: any) {
    return this.http.post('/api/checklogin', user);
  }

  get_user_profile() {
    return this.http.get('/api/users/v1/profile/');
  }

  get_my_asset_groups_assets() {
    return this.http.get<Array<HostGroup>>('/api/perms/v1/user/nodes-assets/');
  }

  get_guacamole_token(user_id: string) {
    const body = new HttpParams()
      .set('username', user_id)
      .set('password', 'jumpserver');
    return this.http.post('/guacamole/api/tokens',
      body.toString(),
      {headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded')});
  }

  guacamole_add_asset(user_id: string, asset_id: string, system_user_id: string) {
    const params = new HttpParams()
      .set('user_id', user_id)
      .set('asset_id', asset_id)
      .set('system_user_id', system_user_id)
      .set('token', DataStore.guacamole_token);
    return this.http.get(
      '/guacamole/api/session/ext/jumpserver/asset/add',
      {
        headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded'),
        params: params
      }
    );
  }

  guacamole_token_add_asset(token: string) {
    const params = new HttpParams()
      .set('asset_token', token)
      .set('token', DataStore.guacamole_token);
    return this.http.get(
      '/guacamole/api/session/ext/jumpserver/asset/token/add',
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

  get_replay(token: string) {
    return this.http.get('/api/terminal/v1/sessions/' + token + '/replay');
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

    if (environment.production) {
      this._logger.level = 2;
      this.checklogin();
    }

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
      if (DataStore.Path['name'] === 'FOF' || DataStore.Path['name'] === 'Forgot') {
      } else {
        if (User.logined) {
          if (document.location.pathname === '/login') {
            this._router.navigate(['']);
          } else {
            this._router.navigate([document.location.pathname]);
          }
          // jQuery('angular2').show();
        } else {
          // this.browser();
          this._http.get_user_profile()
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
                window.location.href = document.location.origin + '/users/login?next=' + document.location.pathname;
                // this._router.navigate(['login']);
              },
              // () => {
              //   if (User.logined) {
              //     if (document.location.pathname === '/login') {
              //       this._router.navigate(['']);
              //     } else {
              //       this._router.navigate([document.location.pathname]);
              //     }
              //   } else {
              //     this._router.navigate(['login']);
              //   }
              // jQuery('angular2').show();
              // }
            );
        }
      }
    } else {
      this._router.navigate(['FOF']);
      // jQuery('angular2').show();
    }
  }

  browser() {
    this._http.report_browser();
  }

  getQueryString(name) {
    const reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
    const r = window.location.search.substr(1).match(reg);
    if (r != null) {
      return unescape(r[2]);
    }
    return null;
  }

//
//
//   HideLeft() {
//     DataStore.leftbarhide = true;
//
//     DataStore.Nav.map(function (value, i) {
//       for (var ii in value['children']) {
//         if (DataStore.Nav[i]['children'][ii]['id'] === 'HideLeftManager') {
//           DataStore.Nav[i]['children'][ii] = {
//             'id': 'ShowLeftManager',
//             'click': 'ShowLeft',
//             'name': 'Show left manager'
//           };
//         }
//       }
//     });
//
//   }
//
//   ShowLeft() {
//     DataStore.leftbarhide = false;
//
//     DataStore.Nav.map(function (value, i) {
//       for (var ii in value['children']) {
//         if (DataStore.Nav[i]['children'][ii]['id'] === 'ShowLeftManager') {
//           DataStore.Nav[i]['children'][ii] = {
//             'id': 'HideLeftManager',
//             'click': 'HideLeft',
//             'name': 'Hide left manager'
//           };
//         }
//       }
//     });
//
//
//   }
//
//     setMyinfo(user:User) {
//         // Update data store
//         this._dataStore.user = user;
//         this._logger.log("service.ts:AppService,setMyinfo");
//         this._logger.debug(user);
// // Push the new list of todos into the Observable stream
// //         this._dataObserver.next(user);
//         // this.myinfo$ = new Observable(observer => this._dataObserver = observer).share()
//     }
//
//   getMyinfo() {
//     this._logger.log('service.ts:AppService,getMyinfo');
//     return this.http.get('/api/userprofile')
//       .map(res => res.json())
//       .subscribe(response => {
//         DataStore.user = response;
//         // this._logger.warn(this._dataStore.user);
//         // this._logger.warn(DataStore.user)
//       });
//   }
//
//   getUser(id: string) {
//     this._logger.log('service.ts:AppService,getUser');
//     return this.http.get('/api/userprofile')
//       .map(res => res.json());
//   }
//
//   gettest() {
//     this._logger.log('service.ts:AppService,gettest');
//     this.http.get('/api/userprofile')
//       .map(res => res.json())
//       .subscribe(res => {
//         return res;
//       });
//   }
//
//   getGrouplist() {
//     this._logger.log('service.ts:AppService,getGrouplist');
//     return this.http.get('/api/grouplist')
//       .map(res => res.json());
//   }
//
//   getUserlist(id: string) {
//     this._logger.log('service.ts:AppService,getUserlist');
//     if (id)
//       return this.http.get('/api/userlist/' + id)
//         .map(res => res.json());
//     else
//       return this.http.get('/api/userlist')
//         .map(res => res.json());
//   }
//
//   delGroup(id) {
//
//   }
//
//
//   copy() {
//     var clipboard = new Clipboard('#Copy');
//
//     clipboard.on('success', function (e) {
//       console.info('Action:', e.action);
//       console.info('Text:', e.text);
//       console.info('Trigger:', e.trigger);
//
//       e.clearSelection();
//     });
//     console.log('ffff');
//     console.log(window.getSelection().toString());
//
//     var copy = new Clipboard('#Copy', {
//       text: function () {
//         return window.getSelection().toString();
//       }
//     });
//     copy.on('success', function (e) {
//       layer.alert('Lucky Copyed!');
//     });
//
//   }
}

@Injectable()
export class UUIDService {
  constructor() {

  }

  gen() {
    return UUID.create()['hex'];
  }
}

