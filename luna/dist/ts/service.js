"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
/**
 * Created by liuzheng on 4/24/16.
 */
var core_1 = require('@angular/core');
var http_1 = require('@angular/http');
var router_deprecated_1 = require('@angular/router-deprecated');
// import {Observable} from 'rxjs/Observable';
// import {Observer} from 'rxjs/Observer';
var ng2_cookies_1 = require('ng2-cookies/ng2-cookies');
// import {CookieService} from 'angular2-cookie/core'
var core_2 = require("angular2-logger/core");
// import {DynamicRouteConfigurator} from './dynamicRouteConfigurator'
require('rxjs/add/operator/share');
require('rxjs/Rx');
// @Injectable()
// export class Logger {
//   logs: string[] = []; // capture logs for testing
//   log(message: string) {
//     this.logs.push(message);
//     console.log(message);
//   }
// }
var User = (function () {
    function User() {
        this.id = 0;
        this.name = '';
        this.username = '';
        this.password = '';
        this.phone = '';
        this.avatar = 'root.png';
        this.role = '';
        this.email = '';
        this.is_active = false;
        this.date_joined = '';
        this.last_login = '';
        this.groups = [''];
    }
    return User;
}());
exports.User = User;
var Group = (function () {
    function Group() {
    }
    return Group;
}());
exports.Group = Group;
exports.DataStore = {
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
    leftbar: "/api/leftbar",
    leftbarrightclick: "/api/leftbarrightclick",
    loglevel: 0,
    term: [],
    termActive: 0,
    leftbarhide: false,
    termlist: [],
    windowsize: [],
};
var AppService = (function () {
    function AppService(http, _router, _logger) {
        this.http = http;
        this._router = _router;
        this._logger = _logger;
        if (ng2_cookies_1.Cookie.get('loglevel')) {
            // 0.- Level.OFF
            // 1.- Level.ERROR
            // 2.- Level.WARN
            // 3.- Level.INFO
            // 4.- Level.DEBUG
            // 5.- Level.LOG
            this._logger.level = parseInt(ng2_cookies_1.Cookie.get('loglevel'));
        }
        else {
            ng2_cookies_1.Cookie.set('loglevel', '0', 99, '/', document.domain);
            // this._logger.level = parseInt(Cookie.getCookie('loglevel'));
            this._logger.level = 0;
        }
        var vm = this;
        exports.DataStore.socket.on('connect', function () {
            console.log("DatsStore socket connected");
            exports.DataStore.socket.on('nav', function (data) {
                exports.DataStore.Nav = JSON.parse(data);
            });
            exports.DataStore.socket.on('leftbar', function (data) {
                if (data == 'changed')
                    vm.ReloadLeftbar();
            });
            exports.DataStore.socket.on('popup', function (data) {
                layer.msg(data);
            });
            exports.DataStore.socket.emit('api', 'all');
        });
        this.checklogin();
    }
    AppService.prototype.checklogin = function () {
        var _this = this;
        var that = this;
        this._logger.log('service.ts:AppService,checklogin');
        if (exports.DataStore.Path)
            if (exports.DataStore.Path['name'] == 'FOF' || exports.DataStore.Path['name'] == 'Forgot') {
            }
            else {
                if (exports.DataStore.logined) {
                    this._router.navigate([exports.DataStore.Path['name']]);
                }
                else {
                    this.http.get('/api/checklogin')
                        .map(function (res) { return res.json(); })
                        .subscribe(function (data) {
                        exports.DataStore.logined = data.logined;
                        exports.DataStore.user = data.user;
                    }, function (err) {
                        _this._logger.error(err);
                        exports.DataStore.logined = false;
                        _this._router.navigate(['Login']);
                    }, function () {
                        if (exports.DataStore.logined) {
                            if (jQuery.isEmptyObject(exports.DataStore.Path))
                                _this._router.navigate(["Index", "/"]);
                            else
                                _this._router.navigate([exports.DataStore.Path['name'], exports.DataStore.Path['res']]);
                        }
                        else
                            _this._router.navigate(['Login']);
                        // jQuery('angular2').show();
                    });
                }
            }
        else {
            this._router.navigate(['FOF']);
        }
    };
    AppService.prototype.login = function (user) {
        var _this = this;
        this._logger.log('service.ts:AppService,login');
        exports.DataStore.error['login'] = '';
        if (user.username.length > 0 && user.password.length > 6 && user.password.length < 100)
            this.http.post('/api/checklogin', JSON.stringify(user)).map(function (res) { return res.json(); })
                .subscribe(function (data) {
                exports.DataStore.logined = data.logined;
                exports.DataStore.user = data.user;
            }, function (err) {
                _this._logger.error(err);
                exports.DataStore.logined = false;
                _this._router.navigate(['Login']);
                exports.DataStore.error['login'] = '后端错误,请重试';
            }, function () {
                if (exports.DataStore.logined) {
                    if (jQuery.isEmptyObject(exports.DataStore.Path))
                        _this._router.navigate(["Index", "/"]);
                    else
                        _this._router.navigate([exports.DataStore.Path['name'], exports.DataStore.Path['res']]);
                }
                else {
                    exports.DataStore.error['login'] = '请检查用户名和密码';
                    _this._router.navigate(['Login']);
                }
                // jQuery('angular2').show();
            });
        else
            exports.DataStore.error['login'] = '请检查用户名和密码';
    };
    AppService.prototype.HideLeft = function () {
        exports.DataStore.leftbarhide = true;
        exports.DataStore.Nav.map(function (value, i) {
            for (var ii in value["children"]) {
                if (exports.DataStore.Nav[i]["children"][ii]["id"] === "HindLeftManager") {
                    exports.DataStore.Nav[i]["children"][ii] = {
                        "id": "ShowLeftManager",
                        "click": "ShowLeft",
                        "name": "Show left manager"
                    };
                }
            }
        });
    };
    AppService.prototype.ShowLeft = function () {
        exports.DataStore.leftbarhide = false;
        exports.DataStore.Nav.map(function (value, i) {
            for (var ii in value["children"]) {
                if (exports.DataStore.Nav[i]["children"][ii]["id"] === "ShowLeftManager") {
                    exports.DataStore.Nav[i]["children"][ii] = {
                        "id": "HindLeftManager",
                        "click": "HideLeft",
                        "name": "Hind left manager"
                    };
                }
            }
        });
    };
    AppService.prototype.ReloadLeftbar = function () {
        jQuery("#left-bar").fancytree("getTree").reload();
    };
    //     setMyinfo(user:User) {
    //         // Update data store
    //         this._dataStore.user = user;
    //         this._logger.log("service.ts:AppService,setMyinfo");
    //         this._logger.debug(user);
    // // Push the new list of todos into the Observable stream
    // //         this._dataObserver.next(user);
    //         // this.myinfo$ = new Observable(observer => this._dataObserver = observer).share()
    //     }
    AppService.prototype.getnav = function () {
        this._logger.log('service.ts:AppService,getnav');
        return this.http.get('/api/nav')
            .map(function (res) { return res.json(); })
            .subscribe(function (response) {
            exports.DataStore.Nav = response;
            // this._logger.warn(this._dataStore.user);
            // this._logger.warn(DataStore.user)
        });
    };
    AppService.prototype.getMyinfo = function () {
        this._logger.log('service.ts:AppService,getMyinfo');
        return this.http.get('/api/userprofile')
            .map(function (res) { return res.json(); })
            .subscribe(function (response) {
            exports.DataStore.user = response;
            // this._logger.warn(this._dataStore.user);
            // this._logger.warn(DataStore.user)
        });
    };
    AppService.prototype.getUser = function (id) {
        this._logger.log('service.ts:AppService,getUser');
        return this.http.get('/api/userprofile')
            .map(function (res) { return res.json(); });
    };
    AppService.prototype.gettest = function () {
        this._logger.log('service.ts:AppService,gettest');
        this.http.get('/api/userprofile')
            .map(function (res) { return res.json(); })
            .subscribe(function (res) {
            return res;
        });
    };
    AppService.prototype.getGrouplist = function () {
        this._logger.log('service.ts:AppService,getGrouplist');
        return this.http.get('/api/grouplist')
            .map(function (res) { return res.json(); });
    };
    AppService.prototype.getUserlist = function (id) {
        this._logger.log('service.ts:AppService,getUserlist');
        if (id)
            return this.http.get('/api/userlist/' + id)
                .map(function (res) { return res.json(); });
        else
            return this.http.get('/api/userlist')
                .map(function (res) { return res.json(); });
    };
    AppService.prototype.delGroup = function (id) {
    };
    AppService.prototype.copy = function () {
        var clipboard = new Clipboard('#Copy');
        clipboard.on('success', function (e) {
            console.info('Action:', e.action);
            console.info('Text:', e.text);
            console.info('Trigger:', e.trigger);
            e.clearSelection();
        });
        console.log('ffff');
        console.log(window.getSelection().toString());
        var copy = new Clipboard('#Copy', {
            text: function () {
                return window.getSelection().toString();
            }
        });
        copy.on('success', function (e) {
            layer.alert('Lucky Copyed!');
        });
    };
    // getMachineList() {
    //     this._logger.log('service.ts:AppService,getMachineList');
    //     return this.http.get('/api/leftbar')
    //         .map(res => res.json())
    //         .subscribe(response => {
    //             DataStore.leftbar = response;
    //             this._logger.debug("DataStore.leftbar:", DataStore.leftbar)
    //
    //             // this._logger.warn(this._dataStore.user);
    //             // this._logger.warn(DataStore.user)
    //         });
    // }
    //
    // getLeftbarRightclick() {
    //     this._logger.log('service.ts:AppService,getLeftbarRightclick');
    //     return this.http.get('/api/leftbarrightclick')
    //         .map(res => res.json())
    //         .subscribe(response => {
    //             DataStore.leftbarrightclick = response;
    //             this._logger.debug("DataStore.leftbarrightclick:", DataStore.leftbarrightclick)
    //             // this._logger.warn(this._dataStore.user);
    //             // this._logger.warn(DataStore.user)
    //         });
    //
    // }
    AppService.prototype.TerminalConnect = function (assetData) {
        var socket = io.connect();
        var vm = this;
        if (ng2_cookies_1.Cookie.get("cols")) {
            var cols = ng2_cookies_1.Cookie.get("cols");
        }
        else {
            var cols = "80";
            ng2_cookies_1.Cookie.set('cols', cols, 99, '/', document.domain);
        }
        if (ng2_cookies_1.Cookie.get("rows")) {
            var rows = ng2_cookies_1.Cookie.get("rows");
        }
        else {
            var rows = "24";
            ng2_cookies_1.Cookie.set('rows', rows, 99, '/', document.domain);
        }
        var id = exports.DataStore.term.push({
            "machine": "localhost",
            "nick": "localhost",
            "connected": true,
            "socket": socket
        }) - 1;
        exports.DataStore.termActive = id;
        exports.DataStore.term[id]["term"] = new Terminal({
            cols: cols,
            rows: rows,
            useStyle: true,
            screenKeys: true
        });
        exports.DataStore.term[id]["term"].on('title', function (title) {
            document.title = title;
        });
        exports.DataStore.term[id]["term"].open(document.getElementById('term-' + id));
        exports.DataStore.term[id]["term"].write('\x1b[31mWelcome to Jumpserver!\x1b[m\r\n');
        socket.on('connect', function () {
            socket.emit('machine', assetData);
            exports.DataStore.term[id]["term"].on('data', function (data) {
                socket.emit('data', data);
            });
            socket.on('data', function (data) {
                exports.DataStore.term[id]["term"].write(data);
            });
            socket.on('disconnect', function () {
                vm.TerminalDisconnect(id);
                // DataStore.term[id]["term"].destroy();
                // DataStore.term[id]["connected"] = false;
            });
            window.onresize = function () {
                var col = Math.floor(jQuery("#term").width() / jQuery("#liuzheng").width() * 8) - 3;
                var row = Math.floor(jQuery("#term").height() / jQuery("#liuzheng").height()) - 3;
                if (ng2_cookies_1.Cookie.get("rows")) {
                    var rows = parseInt(ng2_cookies_1.Cookie.get("rows"));
                }
                else {
                    var rows = 24;
                }
                if (ng2_cookies_1.Cookie.get("cols")) {
                    var cols = parseInt(ng2_cookies_1.Cookie.get("cols"));
                }
                else {
                    var cols = 80;
                }
                if (col < 80)
                    col = 80;
                if (row < 24)
                    row = 24;
                if (cols == col && row == rows) {
                }
                else {
                    for (var termid in exports.DataStore.term) {
                        exports.DataStore.term[termid]["socket"].emit('resize', [col, row]);
                        exports.DataStore.term[termid]["term"].resize(col, row);
                    }
                    ng2_cookies_1.Cookie.set('cols', String(col), 99, '/', document.domain);
                    ng2_cookies_1.Cookie.set('rows', String(row), 99, '/', document.domain);
                }
            };
        });
    };
    AppService.prototype.TerminalDisconnect = function (i) {
        exports.DataStore.term[i]["connected"] = false;
        exports.DataStore.term[i]["socket"].destroy();
        exports.DataStore.term[i]["term"].write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
    };
    AppService.prototype.TerminalDisconnectAll = function () {
        for (var i in exports.DataStore.term) {
            this.TerminalDisconnect(i);
        }
    };
    AppService.prototype.Search = function (q) {
        var _this = this;
        if (this.searchrequest) {
            this.searchrequest.unsubscribe();
        }
        this.searchrequest = this.http.get('/api/search?q=' + q)
            .map(function (res) { return res.json(); })
            .subscribe(function (data) {
            _this._logger.log(data);
        }, function (err) {
            _this._logger.error(err);
        }, function () {
        });
        this._logger.log(q);
    };
    AppService = __decorate([
        core_1.Injectable(), 
        __metadata('design:paramtypes', [http_1.Http, router_deprecated_1.Router, core_2.Logger])
    ], AppService);
    return AppService;
}());
exports.AppService = AppService;
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
//# sourceMappingURL=service.js.map