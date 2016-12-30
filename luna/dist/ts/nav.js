/**
 * Created by liuzheng on 4/7/16.
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
var common_1 = require('@angular/common');
var router_deprecated_1 = require('@angular/router-deprecated');
var core_2 = require("angular2-logger/core");
require('rxjs/Rx');
var service_1 = require('./service');
//noinspection TypeScriptValidateTypes
var NavComponent = (function () {
    function NavComponent(_appService, _logger) {
        this._appService = _appService;
        this._logger = _logger;
        this.DataStore = service_1.DataStore;
        this._logger.log('nav.ts:NavComponent');
        // this._appService.getnav()
    }
    NavComponent.prototype.ngOnInit = function () {
    };
    NavComponent.prototype.click = function (event) {
        this._logger.debug('nav.ts:NavComponent,click', event);
        if (event === "ReloadLeftbar") {
            this._appService.ReloadLeftbar();
        }
        else if (event === "HideLeft") {
            this._appService.HideLeft();
        }
        else if (event === "ShowLeft") {
            this._appService.ShowLeft();
        }
        else if (event === "Copy") {
            this._appService.copy();
        }
        else if (event === "Disconnect") {
            this._appService.TerminalDisconnect(service_1.DataStore.termActive);
        }
        else if (event === "DisconnectAll") {
            this._appService.TerminalDisconnectAll();
        }
        else if (event === "Website") {
            window.open('http://www.jumpserver.org');
        }
        else if (event === "BBS") {
            window.open('http://bbs.jumpserver.org');
        }
        else if (event === "EnterLicense") {
            this.EnterLicense();
        }
    };
    NavComponent.prototype.EnterLicense = function () {
        layer.prompt({
            formType: 2,
            maxlength: 500,
            title: 'Please Input Code',
            scrollbar: false,
            area: ['400px', '300px'],
            moveOut: true,
            moveType: 1
        }, function (value, index) {
            service_1.DataStore.socket.emit('key', value);
            // layer.msg(value); //得到value
            layer.close(index);
        });
    };
    NavComponent = __decorate([
        core_1.Component({
            selector: 'nav',
            template: "<div class=\"nav\">\n    <ul>\n        <li><a [routerLink]=\"['Index']\"><img src=\"./imgs/logo.png\" height=\"26px\"/></a>\n        </li>\n        <li *ngFor=\"let v of DataStore.Nav; let k = index \" [ngClass]=\"{'dropdown': v.children}\">\n            <a>{{v.name}}</a>\n            <ul [ngClass]=\"{'dropdown-content': v.children}\">\n                <li *ngFor=\"let vv of v.children; let kk = index\" [ngClass]=\"{'disabled': vv.disable}\">\n                    <a *ngIf=\"vv.href\" [routerLink]=\"[vv.href]\">{{vv.name}}</a>\n                    <a id=\"{{vv.id}}\" *ngIf=\"vv.click\" (click)=\"click(vv.click)\">{{vv.name}}</a>\n                </li>\n            </ul>\n        </li>\n    </ul>\n</div>",
            directives: [router_deprecated_1.ROUTER_DIRECTIVES, common_1.NgClass]
        }), 
        __metadata('design:paramtypes', [service_1.AppService, core_2.Logger])
    ], NavComponent);
    return NavComponent;
}());
exports.NavComponent = NavComponent;
//# sourceMappingURL=nav.js.map