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
var platform_browser_dynamic_1 = require('@angular/platform-browser-dynamic');
var http_1 = require('@angular/http');
var core_1 = require('@angular/core');
var router_deprecated_1 = require('@angular/router-deprecated');
require('rxjs/Rx');
var core_2 = require("angular2-logger/core");
var service_1 = require('./service');
var nav_1 = require('./nav');
var leftbar_1 = require('./leftbar');
// import {SomeComponent} from './copy-model';
var terminal_1 = require('./terminal');
var login_1 = require('./login');
var hostedit_1 = require('./hostedit');
//noinspection TypeScriptValidateTypes
var WorkboardComponent = (function () {
    function WorkboardComponent() {
        this.DataStore = service_1.DataStore;
    }
    WorkboardComponent = __decorate([
        core_1.Component({
            selector: "div",
            template: "<div id=\"left-bar\" [ngClass]=\"{'hideleftbar':DataStore.leftbarhide}\"></div>\n<term id=\"ngdiv\" [ngClass]=\"{'hideleftbar':DataStore.leftbarhide}\"></term>",
            directives: [leftbar_1.LeftbarComponent, terminal_1.TermComponent]
        }), 
        __metadata('design:paramtypes', [])
    ], WorkboardComponent);
    return WorkboardComponent;
}());
exports.WorkboardComponent = WorkboardComponent;
//noinspection TypeScriptValidateTypes
var IndexComponent = (function () {
    function IndexComponent() {
        this.DataStore = service_1.DataStore;
    }
    IndexComponent = __decorate([
        core_1.Component({
            selector: "div",
            // template: `<div style="background-color: white">Thank you for using <a [routerLink]="['WorkboardComponent']">Bifrost</a></div>`,
            template: "<div id=\"left-bar\" *ngIf=\"!DataStore.leftbarhide\"></div>\n<term id=\"ngdiv\" [ngClass]=\"{'hideleftbar':DataStore.leftbarhide}\"></term>",
            directives: [leftbar_1.LeftbarComponent, terminal_1.TermComponent]
        }), 
        __metadata('design:paramtypes', [])
    ], IndexComponent);
    return IndexComponent;
}());
exports.IndexComponent = IndexComponent;
// const routes:RouterConfig = [
//     {path: '', component: IndexComponent},
//     {path: 'aaa', component: IndexComponent}
// ];
// export const appRouterProviders = [
//     provideRouter(routes)
// ];
//noinspection TypeScriptValidateTypes
var AppComponent = (function () {
    function AppComponent() {
        this.DataStore = service_1.DataStore;
    }
    AppComponent = __decorate([
        core_1.Component({
            selector: 'body',
            template: "<nav></nav>\n<span id=\"liuzheng\" style=\"display:none\">liuzheng</span>\n<router-outlet></router-outlet>",
            directives: [nav_1.NavComponent, router_deprecated_1.ROUTER_DIRECTIVES],
            providers: [service_1.AppService, router_deprecated_1.ROUTER_PROVIDERS]
        }),
        router_deprecated_1.RouteConfig([
            { path: '/login', name: 'Login', component: login_1.LoginComponent },
            { path: '/', name: 'Index', component: IndexComponent },
            { path: '/aaa', name: 'Aaaa', component: IndexComponent },
            { path: '/bifrost', name: 'WorkboardComponent', component: WorkboardComponent },
            { path: '/hostedit', name: 'HostEdit', component: hostedit_1.HostEditComponent },
        ]), 
        __metadata('design:paramtypes', [])
    ], AppComponent);
    return AppComponent;
}());
exports.AppComponent = AppComponent;
platform_browser_dynamic_1.bootstrap(AppComponent, [
    http_1.HTTP_PROVIDERS,
    core_2.Logger,
    service_1.AppService
]);
//# sourceMappingURL=index.js.map