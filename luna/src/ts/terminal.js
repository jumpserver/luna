/**
 * Created by liuzheng on 7/16/16.
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
var core_2 = require("angular2-logger/core");
require('rxjs/Rx');
var service_1 = require('./service');
var TermComponent = (function () {
    function TermComponent(_appService, _logger) {
        this._appService = _appService;
        this._logger = _logger;
        this.DataStore = service_1.DataStore;
        this._logger.log('TermComponent.ts:TermComponent');
    }
    TermComponent.prototype.ngOnInit = function () {
        //DataStore.term[0]["term"].open(document.getElementById("term-0"))
        this.timer();
    };
    TermComponent.prototype.ngAfterViewInit = function () {
        // this._appService.TerminalConnect({});
        //this._logger.debug("term width ", jQuery("#term").width());
        //this._logger.debug("term height", jQuery("#term").height());
    };
    TermComponent.prototype.timer = function () {
        var _this = this;
        if (service_1.DataStore.termlist.length > 0) {
            for (var i in service_1.DataStore.termlist) {
                this._appService.TerminalConnect(service_1.DataStore.termlist[i]);
            }
            service_1.DataStore.termlist = [];
        }
        jQuery(window).trigger('resize');
        setTimeout(function () {
            _this.timer();
        }, 0);
    };
    TermComponent.prototype.close = function (i) {
        this._logger.debug(i);
        this._appService.TerminalDisconnect(i);
        // DataStore.term[i]["term"].destroy();
        service_1.DataStore.term.splice(i, 1);
        this.checkActive(i);
    };
    TermComponent.prototype.checkActive = function (index) {
        var len = service_1.DataStore.term.length;
        if (len == 1) {
            // 唯一一个
            service_1.DataStore.termActive = 0;
        }
        else {
            if (len == index) {
                // 删了最后一个
                service_1.DataStore.termActive = index - 1;
            }
            else if (len > index) {
                service_1.DataStore.termActive = index;
            }
        }
    };
    TermComponent.prototype.setActive = function (index) {
        service_1.DataStore.termActive = index;
    };
    TermComponent.prototype.dblclick = function () {
        console.log(service_1.DataStore.term);
    };
    TermComponent = __decorate([
        core_1.Component({
            selector: 'term',
            template: "<div id=\"tabs\" style=\"height: 30px;width: 100%\">\n    <ul>\n        <li *ngFor=\"let m of DataStore.term;let i = index\"\n            [ngClass]=\"{'active':i==DataStore.termActive,'disconnected':!m.connected, 'hidden': m.closed}\"\n            id=\"termnav-{{i}}\" (click)=\"setActive(i)\">\n            <span *ngIf=\"!m.$edit\" (dblclick)=\"m.$edit=true;setActive(i)\">{{m.nick}}</span>\n            <input *ngIf=\"m.$edit\" [(ngModel)]=\"m.nick\" autofocus (blur)=\"m.$edit=false\" (keyup.enter)=\"m.$edit=false\"/>\n            <a class=\"close\" (click)=\"close(i)\">&times;</a></li>\n    </ul>\n</div>\n<div id=\"term\" style=\"width: 100%;height: 100%;\">\n    <div *ngFor=\"let m of DataStore.term;let i = index\" [ngClass]=\"{'disconnected':!m.connected, 'hidden': i!=DataStore.termActive || m.closed}\" id=\"term-{{i}}\"></div>\n</div>",
            directives: [common_1.NgClass, common_1.FORM_DIRECTIVES]
        }), 
        __metadata('design:paramtypes', [service_1.AppService, core_2.Logger])
    ], TermComponent);
    return TermComponent;
}());
exports.TermComponent = TermComponent;
//# sourceMappingURL=terminal.js.map