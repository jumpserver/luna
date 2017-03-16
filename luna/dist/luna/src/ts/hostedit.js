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
var HostEditComponent = (function () {
    function HostEditComponent(_appService, _logger) {
        this._appService = _appService;
        this._logger = _logger;
        this.DataStore = service_1.DataStore;
        this._logger.log('SomeComponent.ts:SomeComponent');
    }
    HostEditComponent.prototype.ngOnInit = function () {
    };
    HostEditComponent = __decorate([
        core_1.Component({
            selector: 'div',
            template: "<div style=\"background-color: #fff;\">\n<table class=\"ui red table\">\n  <thead>\n    <tr><th>Food</th>\n    <th>Calories</th>\n    <th>Protein</th>\n  </tr></thead><tbody>\n    <tr>\n      <td>Apples</td>\n      <td>200</td>\n      <td>0g</td>\n    </tr>\n    <tr>\n      <td>Orange</td>\n      <td>310</td>\n      <td>0g</td>\n    </tr>\n  </tbody>\n</table>\n</div>",
        }), 
        __metadata('design:paramtypes', [service_1.AppService, core_2.Logger])
    ], HostEditComponent);
    return HostEditComponent;
}());
exports.HostEditComponent = HostEditComponent;
//# sourceMappingURL=hostedit.js.map