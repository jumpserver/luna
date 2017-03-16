/**
 * Created by liuzheng on 7/16/16.
 */

import {Component} from '@angular/core';
import {NgClass, FORM_DIRECTIVES}    from '@angular/common';
import {ROUTER_DIRECTIVES} from '@angular/router-deprecated';
import {Logger} from "angular2-logger/core";
import {$WebSocket} from 'angular2-websocket/angular2-websocket';
import {Cookie} from 'ng2-cookies/ng2-cookies';

import  'rxjs/Rx';
declare var jQuery:any;

import {AppService, DataStore} from './service'


@Component({
    selector: 'term',
    template: `<div id="tabs" style="height: 30px;width: 100%">
    <ul>
        <li *ngFor="let m of DataStore.term;let i = index"
            [ngClass]="{'active':i==DataStore.termActive,'disconnected':!m.connected}"
            id="termnav-{{i}}">
            <span *ngIf="!m.$edit" (click)="DataStore.termActive=i" (dblclick)="m.$edit=true;DataStore.termActive=i">{{m.nick}}</span>
            <input *ngIf="m.$edit" [(ngModel)]="m.nick" autofocus (blur)="m.$edit=false" (keyup.enter)="m.$edit=false"/>
            <a class="close" (click)="close(i)" onclick="this.parentElement.style.display='none';">x</a></li>
    </ul>
</div>
<div id="term" style="width: 100%;height: 100%;">
    <div id="term-0" [ngClass]="{'hidden':DataStore.termActive!=0}"></div>
    <div *ngFor="let m of DataStore.term; let i = index" [ngClass]="{'hidden':i+1!=DataStore.termActive}"
         id="term-{{i+1}}"></div>
</div>`,
    directives: [NgClass, FORM_DIRECTIVES]
})


export class TermComponent {
    DataStore = DataStore;
    // portocol:string;
    endpoint:string;

    constructor(private _appService:AppService,
                private _logger:Logger) {
        this._logger.log('TermComponent.ts:TermComponent');
    }

    ngOnInit() {
        //DataStore.term[0]["term"].open(document.getElementById("term-0"))
        this.timer();
    }

    ngAfterViewInit() {
        this._appService.TerminalConnect({});
        //this._logger.debug("term width ", jQuery("#term").width());
        //this._logger.debug("term height", jQuery("#term").height());
    }

    timer() {
        if (DataStore.termlist.length > 0) {
            for (var i in DataStore.termlist)
                this._appService.TerminalConnect(DataStore.termlist[i]);
            DataStore.termlist = []
        }
        jQuery(window).trigger('resize');
        setTimeout(()=> {
            this.timer()
        }, 0)
    }

    close(i) {
        this._logger.debug(i);
        this._appService.TerminalDisconnect(i);
        DataStore.term[i]["term"].destroy();

        // delete DataStore.term.splice(i, 1)
    }

    dblclick() {
        console.log(DataStore.term)
    }
}
