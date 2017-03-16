/**
 * Created by liuzheng on 7/12/16.
 */

import {Component} from '@angular/core';
import {NgClass}    from '@angular/common';
import {ROUTER_DIRECTIVES} from '@angular/router-deprecated';
import {Logger} from "angular2-logger/core";

import  'rxjs/Rx';
declare var jQuery:any;

import {AppService, DataStore} from './service'


@Component({
    selector: 'ng-div',
    template: `<div><p >{{DataStore.logined}}</p></div>`,
})


export class SomeComponent {
    DataStore = DataStore;

    constructor(private _appService:AppService,
                private _logger:Logger) {
        this._logger.log('SomeComponent.ts:SomeComponent');
    }

    ngOnInit() {

    }

}