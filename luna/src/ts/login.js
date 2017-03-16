/**
 * Created by liuzheng on 7/12/16.
 */
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
var core_1 = require('@angular/core');
var core_2 = require("angular2-logger/core");
require('rxjs/Rx');
var service_1 = require('./service');
var LoginComponent = (function () {
    function LoginComponent(_appService, _logger, user) {
        this._appService = _appService;
        this._logger = _logger;
        this.user = user;
        this.DataStore = service_1.DataStore;
        this._logger.log('login.ts:LoginComponent');
    }
    LoginComponent.prototype.onSubmit = function () {
        this._logger.log(service_1.DataStore);
        this._appService.login(this.user);
    };
    LoginComponent.prototype.ngOnInit = function () {
        jQuery("#form").fadeIn("slow");
        if (window.location.pathname != "/login") {
            window.location.href = "/login";
        }
        // jQuery('nav').hide();
        var vm = this;
        window.onresize = function () {
            if (!service_1.DataStore.logined) {
                vm.background();
            }
        };
        this.timer();
    };
    LoginComponent.prototype.timer = function () {
        var _this = this;
        if (service_1.DataStore.windowsize[0] != document.documentElement.clientWidth || service_1.DataStore.windowsize[1] != document.documentElement.clientHeight && !service_1.DataStore.logined) {
            jQuery(window).trigger('resize');
            service_1.DataStore.windowsize = [document.documentElement.clientWidth, document.documentElement.clientHeight];
        }
        setTimeout(function () {
            _this.timer();
        }, 33);
    };
    LoginComponent.prototype.background = function () {
        var q = jQuery('#q')[0];
        var width = q.width = document.documentElement.clientWidth;
        var height = q.height = document.documentElement.clientHeight;
        var letters = [];
        for (var i = 0; i < 256; i++) {
            letters.push(Math.round(Math.random() * i * 33));
        }
        var draw = function () {
            q.getContext('2d').fillStyle = 'rgba(0,0,0,.05)';
            q.getContext('2d').fillRect(0, 0, width, height);
            q.getContext('2d').fillStyle = '#0F0';
            letters.map(function (y_pos, index) {
                var text = String.fromCharCode(65 + Math.random() * 26);
                var x_pos = index * 10;
                q.getContext('2d').fillText(text, x_pos, y_pos);
                letters[index] = (y_pos > 758 + Math.random() * 1e4) ? 0 : y_pos + 10;
            });
        };
        setInterval(draw, 33);
    };
    LoginComponent = __decorate([
        core_1.Component({
            selector: 'div',
            template: "<div style=\"position: fixed;top: 0;left:0;width:100%;height:100%;z-index: 5;background-color: #000000;\"></div>\n<canvas id=\"q\" style=\"position:fixed;top: 0;z-index: 5;\"></canvas>\n<div id=\"form\" style=\"z-index: 9;display: none;\">\n<form  (ngSubmit)=\"onSubmit()\"style=\"z-index:9;\" >\n    <div class=\"from-group\">\n  <input type=\"text\" name=\"username\" id=\"username\" placeholder=\"Username\" [(ngModel)]=\"user.username\" required>\n  <span class=\"fa fa-user-secret form-control-feedback\"></span>\n    </div>\n    <div class=\"from-group\">\n  <input type=\"password\" name=\"password\" id=\"password\" placeholder=\"password\" [(ngModel)]=\"user.password\" required (ngEnter)=\"onSubmit()\">\n    <span class=\"fa fa-key form-control-feedback\"></span>\n    </div>\n  <button type=\"submit\">login to your account</button>\n</form>\n</div>",
            providers: [service_1.AppService, service_1.User]
        }), 
        __metadata('design:paramtypes', [service_1.AppService, core_2.Logger, service_1.User])
    ], LoginComponent);
    return LoginComponent;
}());
exports.LoginComponent = LoginComponent;
//# sourceMappingURL=login.js.map