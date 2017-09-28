/**
 * Created by liuzheng on 2017/8/30.
 */
import {Injectable, NgModule} from '@angular/core';
import {Http, Request, RequestOptionsArgs,   Headers} from '@angular/http';
import {Cookie} from 'ng2-cookies/ng2-cookies';
import {Logger} from 'angular2-logger/core';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';

declare let jQuery: any;
// declare var Terminal: any;
// declare var Clipboard: any;
import * as io from 'socket.io-client';
// declare let io: any;
// declare var layer: any;
// @Injectable()
// export class Logger {
//   logs: string[] = []; // capture logs for testing
//   log(message: string) {
//     this.logs.push(message);
//     console.log(message);
//   }
// }

export class Group {
  id: number;
  name: string;
  membercount: number;
  comment: string;
}

export let User: {
  id: number;
  name: string;
  username: string;
  password: string;
  phone: string;
  avatar: string;
  role: string;
  email: string;
  is_active: boolean;
  date_joined: string;
  last_login: string;
  groups: Array<Group>;
  logined: boolean;
} = {
  id: 0,
  name: 'nobody',
  username: '',
  password: '',
  phone: '',
  avatar: '',
  role: '',
  email: '',
  is_active: false,
  date_joined: '',
  last_login: '',
  groups: [],
  logined: false,
};

export let DataStore: {
  socket: any;
  Nav: Array<{}>;
  Path: {};
  error: {};
  msg: {};
  loglevel: number;
  leftbarhide: boolean;
  windowsize: Array<number>;
} = {
  socket: io.connect(),
  Nav: [{}],
  Path: {},
  error: {},
  msg: {},
  loglevel: 0,
  leftbarhide: false,
  windowsize: [],
};
export let CSRF: string = '';

export let Browser: {
  userAgent: string;
  appCodeName: string;
  appName: string;
  appVersion: string;
  language: string;
  platform: string;
  product: string;
  productSub: string;
  vendor: string;
} = {
  userAgent: navigator.userAgent,
  appCodeName: navigator.appCodeName,
  appName: navigator.appName,
  appVersion: navigator.appVersion,
  language: navigator.language,
  platform: navigator.platform,
  product: navigator.product,
  productSub: navigator.productSub,
  vendor: navigator.vendor,
};

@Injectable()
export class HttpService {
  headers = new Headers();

  constructor(private _http: Http) {
  }

  // request(url: string | Request, options?: RequestOptionsArgs) {
  //   if (options == null) {
  //     options = {};
  //   }
  //   options.headers = this.headers;
  //   return this._http.request(url, options)
  // }

  get(url: string, options?: RequestOptionsArgs) {
    if (options == null) {
      options = {};
    }
    options.headers = this.headers;
    return this._http.get(url, options)
  }

  post(url: string, body: any, options?: RequestOptionsArgs) {
    if (options == null) {
      options = {};
    }
    options.headers = this.headers;
    return this._http.post(url, body, options)
  }

  put(url: string, body: any, options?: RequestOptionsArgs) {
    if (options == null) {
      options = {};
    }
    options.headers = this.headers;
    return this._http.put(url, body, options)
  }

  delete(url: string, options?: RequestOptionsArgs) {
    if (options == null) {
      options = {};
    }
    options.headers = this.headers;
    return this._http.delete(url, options)
  }

  patch(url: string, body: any, options?: RequestOptionsArgs) {
    if (options == null) {
      options = {};
    }
    options.headers = this.headers;
    return this._http.patch(url, body, options)
  }

  head(url: string, options?: RequestOptionsArgs) {
    if (options == null) {
      options = {};
    }
    options.headers = this.headers;
    return this._http.head(url, options)
  }

  options(url: string, options?: RequestOptionsArgs) {
    if (options == null) {
      options = {};
    }
    options.headers = this.headers;
    return this._http.options(url, options)
  }

}

@Injectable()
export class AppService {
  // user:User = user  ;
  // searchrequest: any;

  constructor(private _http: HttpService,
              private _logger: Logger) {
    if (Cookie.get('loglevel')) {

      // 0.- Level.OFF
      // 1.- Level.ERROR
      // 2.- Level.WARN
      // 3.- Level.INFO
      // 4.- Level.DEBUG
      // 5.- Level.LOG
      this._logger.level = parseInt(Cookie.get('loglevel'), 10);
      // this._logger.debug('Your debug stuff');
      // this._logger.info('An info');
      // this._logger.warn('Take care ');
      // this._logger.error('Too late !');
      // this._logger.log('log !');
    } else {
      Cookie.set('loglevel', '0', 99, '/', document.domain);
      // this._logger.level = parseInt(Cookie.getCookie('loglevel'));
      this._logger.level = 0;
    }
    DataStore.socket.on('connect', function () {
      console.log('DatsStore socket connected');
      DataStore.socket.on('nav', function (data) {
        DataStore.Nav = JSON.parse(data);
      });
      // DataStore.socket.on('popup', function (data) {
      //   layer.msg(data);
      // });

      // DataStore.socket.emit('api', 'all');
    });
    // this.checklogin();
    this.browser()
  }

  browser() {
    this._http.post('/api/browser', JSON.stringify(Browser)).map(res => res.json())
  }

//
//   checklogin() {
//     this._logger.log('service.ts:AppService,checklogin');
//
//     if (DataStore.Path)
//       if (DataStore.Path['name'] == 'FOF' || DataStore.Path['name'] == 'Forgot') {
//       }
//       // jQuery('angular2').show();
//       else {
//         if (DataStore.logined) {
//           this._router.navigate([DataStore.Path['name']]);
//           // jQuery('angular2').show();
//         } else {
//           this.http.get('/api/checklogin')
//             .map(res => res.json())
//             .subscribe(
//               data => {
//                 DataStore.logined = data.logined;
//                 DataStore.user = data.user;
//               },
//               err => {
//                 this._logger.error(err);
//                 DataStore.logined = false;
//                 this._router.navigate(['Login']);
//               },
//               () => {
//                 if (DataStore.logined) {
//                   if (jQuery.isEmptyObject(DataStore.Path))
//                     this._router.navigate(['Index', '/']);
//                   else
//                     this._router.navigate([DataStore.Path['name'], DataStore.Path['res']]);
//                 }
//                 else
//                   this._router.navigate(['Login']);
//                 // jQuery('angular2').show();
//               }
//             );
//         }
//       }
//     else {
//       this._router.navigate(['FOF']);
//       // jQuery('angular2').show();
//     }
//   }
//
//   login(user: User) {
//     this._logger.log('service.ts:AppService,login');
//     DataStore.error['login'] = '';
//     if (user.username.length > 0 && user.password.length > 6 && user.password.length < 100)
//       this.http.post('/api/checklogin', JSON.stringify(user)).map(res => res.json())
//         .subscribe(
//           data => {
//             DataStore.logined = data.logined;
//             DataStore.user = data.user;
//           },
//           err => {
//             this._logger.error(err);
//             DataStore.logined = false;
//             this._router.navigate(['Login']);
//             DataStore.error['login'] = '后端错误,请重试';
//           },
//           () => {
//             if (DataStore.logined) {
//               if (jQuery.isEmptyObject(DataStore.Path))
//                 this._router.navigate(['Index', '/']);
//               else
//                 this._router.navigate([DataStore.Path['name'], DataStore.Path['res']]);
//             } else {
//               DataStore.error['login'] = '请检查用户名和密码';
//               this._router.navigate(['Login']);
//             }
//             // jQuery('angular2').show();
//
//           });
//     else
//       DataStore.error['login'] = '请检查用户名和密码';
//
//   }
//
//
//   HideLeft() {
//     DataStore.leftbarhide = true;
//
//     DataStore.Nav.map(function (value, i) {
//       for (var ii in value['children']) {
//         if (DataStore.Nav[i]['children'][ii]['id'] === 'HindLeftManager') {
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
//             'id': 'HindLeftManager',
//             'click': 'HideLeft',
//             'name': 'Hind left manager'
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
