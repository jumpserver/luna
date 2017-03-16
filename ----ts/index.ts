/**
 * Created by liuzheng on 4/7/16.
 */

import {bootstrap}    from '@angular/platform-browser-dynamic';
import {Http, HTTP_PROVIDERS}   from '@angular/http';
import {Component}         from '@angular/core';
import {RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS} from '@angular/router-deprecated';

import  'rxjs/Rx';
declare var jQuery:any;
import {Logger} from "angular2-logger/core";
import {AppService, User, DataStore} from './service';
import {NavComponent} from './nav';
import {LeftbarComponent} from './leftbar';
// import {SomeComponent} from './copy-model';
import {TermComponent} from './terminal';
import {LoginComponent} from './login';
import {HostEditComponent} from './hostedit';


//noinspection TypeScriptValidateTypes
@Component({
    selector: "div",
    template: `<div id="left-bar" [ngClass]="{'hideleftbar':DataStore.leftbarhide}"></div>
<term id="ngdiv" [ngClass]="{'hideleftbar':DataStore.leftbarhide}"></term>`,
    directives: [LeftbarComponent, TermComponent]
})
export class WorkboardComponent {
    DataStore = DataStore;
}
//noinspection TypeScriptValidateTypes
@Component({
    selector: "div",
    // template: `<div style="background-color: white">Thank you for using <a [routerLink]="['WorkboardComponent']">Bifrost</a></div>`,
    template: `<div id="left-bar" *ngIf="!DataStore.leftbarhide"></div>
<term id="ngdiv" [ngClass]="{'hideleftbar':DataStore.leftbarhide}"></term>`,
    directives: [LeftbarComponent, TermComponent]
})

export class IndexComponent {
    DataStore = DataStore;
}

// const routes:RouterConfig = [
//     {path: '', component: IndexComponent},
//     {path: 'aaa', component: IndexComponent}
// ];
// export const appRouterProviders = [
//     provideRouter(routes)
// ];


//noinspection TypeScriptValidateTypes
@Component({
    selector: 'body',
    template: `<nav></nav>
<span id="liuzheng" style="display:none">liuzheng</span>
<router-outlet></router-outlet>`,
    directives: [NavComponent, ROUTER_DIRECTIVES],
    providers: [AppService, ROUTER_PROVIDERS]
})

//noinspection TypeScriptValidateTypes
@RouteConfig([
    {path: '/login', name: 'Login', component: LoginComponent},
    {path: '/', name: 'Index', component: IndexComponent},
    {path: '/aaa', name: 'Aaaa', component: IndexComponent},
    {path: '/bifrost', name: 'WorkboardComponent', component: WorkboardComponent},
    {path: '/hostedit', name: 'HostEdit', component: HostEditComponent},
    // {path: '/kkk', name: 'Kkk', component: KkkComponent},

    // {path: '/kkk', name: 'Kkk', component: KkkComponent},

])
export class AppComponent {
    DataStore = DataStore;

    // constructor(
    //             private _appService:AppService,
    //             private _logger:Logger) {
    //
    // }
}

bootstrap(AppComponent, [
    HTTP_PROVIDERS,
    Logger,
    AppService
]);



