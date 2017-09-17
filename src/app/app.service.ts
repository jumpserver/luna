/**
 * Created by liuzheng on 2017/8/30.
 */
import {Injectable, NgModule} from '@angular/core';
import {Http} from '@angular/http';
import {Cookie} from 'ng2-cookies/ng2-cookies';
// import {CookieService} from 'angular2-cookie/core'
import {Logger} from 'angular2-logger/core';
import 'rxjs/add/operator/map';
// import {DynamicRouteConfigurator} from './dynamicRouteConfigurator'
// import 'rxjs/add/operator/share';
// import  'rxjs/Rx';
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
import {Router} from '@angular/router';


export class User {
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
  groups: Array<string>;
  logined:boolean;
}
export class Group {
  id: number;
  name: string;
  membercount: number;
  comment: string;
}

export let DataStore: {
  socket: any;
  user: User;
  Nav: Array<{}>;
  logined: boolean;
  lastNavigationAttempt: string;
  route: Array<{}>;
  activenav: {};
  Path: {};
  error: {};
  msg: {};
  leftbar: string;
  leftbarrightclick: string;
  loglevel: number;
  term: Array<{}>;
  termActive: number;
  leftbarhide: boolean;
  termlist: Array<string>;
  windowsize: Array<number>;
} = {
  socket: io.connect(),
  user: new User,
  Nav: [{}],
  logined: false,
  lastNavigationAttempt: '',
  route: [{}],
  activenav: {},
  Path: {},
  error: {},
  msg: {},
  leftbar: '/api/leftbar',
  leftbarrightclick: '/api/leftbarrightclick',
  loglevel: 0,
  term: [],
  termActive: 0,
  leftbarhide: false,
  termlist: [],
  windowsize: [],
};


@Injectable()
export class AppService {
  // user:User = user  ;
  // searchrequest: any;

  constructor(private http: Http,
              private _router: Router,
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
    const vm = this;
    DataStore.socket.on('connect', function () {
      console.log('DatsStore socket connected');
      DataStore.socket.on('nav', function (data) {
        DataStore.Nav = JSON.parse(data);
      });
      DataStore.socket.on('leftbar', function (data) {
        if (data === 'changed') {
          vm.ReloadLeftbar();
        }
      });
      // DataStore.socket.on('popup', function (data) {
      //   layer.msg(data);
      // });

      // DataStore.socket.emit('api', 'all');
    });
    this.checklogin();
  }


  checklogin() {
    this._logger.log('service.ts:AppService,checklogin');

    if (DataStore.Path) {
      if (DataStore.Path['name'] === 'FOF' || DataStore.Path['name'] === 'Forgot') {
      } else {
        if (DataStore.logined) {
          this._router.navigate([DataStore.Path['name']]);
          // jQuery('angular2').show();
        } else {
          this.http.get('/api/checklogin')
            .map(res => res.json())
            .subscribe(
              data => {
                DataStore.logined = data.logined;
                DataStore.user = data.user;
              },
              err => {
                this._logger.error(err);
                DataStore.logined = false;
                this._router.navigate(['login']);
              },
              () => {
                if (DataStore.logined) {
                  if (jQuery.isEmptyObject(DataStore.Path)) {
                    this._router.navigate(['']);
                  } else {
                    this._router.navigate([DataStore.Path['name'], DataStore.Path['res']]);
                  }
                } else {
                  this._router.navigate(['login']);
                }
                // jQuery('angular2').show();
              }
            );
        }
      }
    } else {
      this._router.navigate(['FOF']);
      // jQuery('angular2').show();
    }
  }

  login(user: User) {
    this._logger.log('service.ts:AppService,login');
    DataStore.error['login'] = '';
    if (user.username.length > 0 && user.password.length > 6 && user.password.length < 100) {
      this.http.post('/api/checklogin', JSON.stringify(user)).map(res => res.json())
        .subscribe(
          data => {
            DataStore.logined = data.logined;
            DataStore.user = data.user;
          },
          err => {
            this._logger.error(err);
            DataStore.logined = false;
            this._router.navigate(['login']);
            DataStore.error['login'] = '后端错误,请重试';
          },
          () => {
            if (DataStore.logined) {
              if (jQuery.isEmptyObject(DataStore.Path)) {
                this._router.navigate(['welcome']);
              } else {
                this._router.navigate([DataStore.Path['name'], DataStore.Path['res']]);
              }
            } else {
              DataStore.error['login'] = '请检查用户名和密码';
              this._router.navigate(['login']);
            }
            // jQuery('angular2').show();

          });
    } else {
      DataStore.error['login'] = '请检查用户名和密码';
    }
  }

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
  ReloadLeftbar() {
    jQuery('#left-bar').fancytree('getTree').reload();
  }

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
//
//   // getMachineList() {
//   //     this._logger.log('service.ts:AppService,getMachineList');
//   //     return this.http.get('/api/leftbar')
//   //         .map(res => res.json())
//   //         .subscribe(response => {
//   //             DataStore.leftbar = response;
//   //             this._logger.debug("DataStore.leftbar:", DataStore.leftbar)
//   //
//   //             // this._logger.warn(this._dataStore.user);
//   //             // this._logger.warn(DataStore.user)
//   //         });
//   // }
//   //
//   // getLeftbarRightclick() {
//   //     this._logger.log('service.ts:AppService,getLeftbarRightclick');
//   //     return this.http.get('/api/leftbarrightclick')
//   //         .map(res => res.json())
//   //         .subscribe(response => {
//   //             DataStore.leftbarrightclick = response;
//   //             this._logger.debug("DataStore.leftbarrightclick:", DataStore.leftbarrightclick)
//   //             // this._logger.warn(this._dataStore.user);
//   //             // this._logger.warn(DataStore.user)
//   //         });
//   //
//   // }
//   TerminalConnect(uuid) {
//     var socket = io.connect();
//     var vm = this;
//
//     if (Cookie.get('cols')) {
//       var cols = Cookie.get('cols');
//     } else {
//       var cols = '80';
//       Cookie.set('cols', cols, 99, '/', document.domain);
//     }
//     if (Cookie.get('rows')) {
//       var rows = Cookie.get('rows');
//     } else {
//       var rows = '24';
//       Cookie.set('rows', rows, 99, '/', document.domain);
//     }
//     var id = DataStore.term.push({
//         'machine': 'localhost',
//         'nick': 'localhost',
//         'connected': true,
//         'socket': socket
//       }) - 1;
//     DataStore.termActive = id;
//     DataStore.term[id]['term'] = new Terminal({
//       cols: cols,
//       rows: rows,
//       useStyle: true,
//       screenKeys: true
//     });
//
//     DataStore.term[id]['term'].on('title', function (title) {
//       document.title = title;
//     });
//
//     DataStore.term[id]['term'].open(document.getElementById('term-' + id));
//
//     DataStore.term[id]['term'].write('\x1b[31mWelcome to Jumpserver!\x1b[m\r\n');
//
//     socket.on('connect', function () {
//       socket.emit('machine', uuid);
//
//       DataStore.term[id]['term'].on('data', function (data) {
//         socket.emit('data', data);
//       });
//
//
//       socket.on('data', function (data) {
//         DataStore.term[id]['term'].write(data);
//       });
//
//       socket.on('disconnect', function () {
//         vm.TerminalDisconnect(id);
//         // DataStore.term[id]["term"].destroy();
//         // DataStore.term[id]["connected"] = false;
//       });
//
//       window.onresize = function () {
//         var col = Math.floor(jQuery('#term').width() / jQuery('#liuzheng').width() * 8) - 3;
//         var row = Math.floor(jQuery('#term').height() / jQuery('#liuzheng').height()) - 3;
//         if (Cookie.get('rows')) {
//           var rows = parseInt(Cookie.get('rows'));
//         } else {
//           var rows = 24;
//         }
//         if (Cookie.get('cols')) {
//           var cols = parseInt(Cookie.get('cols'));
//         } else {
//           var cols = 80;
//         }
//         if (col < 80) col = 80;
//         if (row < 24) row = 24;
//         if (cols == col && row == rows) {
//         } else {
//           for (var termid in DataStore.term) {
//             DataStore.term[termid]['socket'].emit('resize', [col, row]);
//             DataStore.term[termid]['term'].resize(col, row);
//           }
//           Cookie.set('cols', String(col), 99, '/', document.domain);
//           Cookie.set('rows', String(row), 99, '/', document.domain);
//         }
//       };
//     });
//
//   }
//
//   TerminalDisconnect(i) {
//     DataStore.term[i]['connected'] = false;
//     DataStore.term[i]['socket'].destroy();
//     DataStore.term[i]['term'].write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
//   }
//
//   TerminalDisconnectAll() {
//     for (var i in DataStore.term) {
//       this.TerminalDisconnect(i);
//       // DataStore.term[i]["connected"] = false;
//       // DataStore.term[i]["socket"].destroy();
//       // DataStore.term[i]["term"].write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
//     }
//   }
//
//   Search(q) {
//     if (this.searchrequest) {
//       this.searchrequest.unsubscribe();
//     }
//     this.searchrequest = this.http.get('/api/search?q=' + q)
//       .map(res => res.json())
//       .subscribe(
//         data => {
//           this._logger.log(data);
//         },
//         err => {
//           this._logger.error(err);
//         },
//         () => {
//         }
//       );
//     this._logger.log(q);
//   }
}
// }
//
// @Pipe({
//     name: 'join'
// })
//
// export class Join {
//     transform(value, args?) {
//         if (typeof value === 'undefined')
//             return 'undefined';
//         return value.join(args)
//     }
// }
