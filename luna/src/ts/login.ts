/**
 * Created by liuzheng on 7/12/16.
 */

import {Component} from '@angular/core';
import {NgClass}    from '@angular/common';
import {ROUTER_DIRECTIVES, ROUTER_PROVIDERS} from '@angular/router-deprecated';
import {Logger} from "angular2-logger/core";

import  'rxjs/Rx';
declare var jQuery:any;

import {AppService, DataStore, User} from './service'


@Component({
    selector: 'div',
    template: `<div style="position: fixed;top: 0;left:0;width:100%;height:100%;z-index: 5;background-color: #000000;"></div>
<canvas id="q" style="position:fixed;top: 0;z-index: 5;"></canvas>
<div id="form" style="z-index: 9;display: none;">
<form  (ngSubmit)="onSubmit()"style="z-index:9;" >
    <div class="from-group">
  <input type="text" name="username" id="username" placeholder="Username" [(ngModel)]="user.username" required>
  <span class="fa fa-user-secret form-control-feedback"></span>
    </div>
    <div class="from-group">
  <input type="password" name="password" id="password" placeholder="password" [(ngModel)]="user.password" required (ngEnter)="onSubmit()">
    <span class="fa fa-key form-control-feedback"></span>
    </div>
  <button type="submit">login to your account</button>
</form>
</div>`,
    providers: [AppService, User]
})
// ToDo: ngEnter and redirect to default page

export class LoginComponent {
    DataStore = DataStore;


    constructor(private _appService:AppService,
                private _logger:Logger,
                private user:User) {
        this._logger.log('login.ts:LoginComponent');
    }


    onSubmit() {
        this._logger.log(DataStore);
        this._appService.login(this.user)
    }

    ngOnInit() {
        jQuery("#form").fadeIn("slow");
        if (window.location.pathname != "/login") {
            window.location.href = "/login"
        }
        // jQuery('nav').hide();
        var vm = this;
        window.onresize = function () {
            if (!DataStore.logined) {
                vm.background();
            }
        };

        this.timer();

    }

    timer() {
        if (DataStore.windowsize[0] != document.documentElement.clientWidth || DataStore.windowsize[1] != document.documentElement.clientHeight && !DataStore.logined) {
            jQuery(window).trigger('resize');
            DataStore.windowsize = [document.documentElement.clientWidth, document.documentElement.clientHeight]
        }
        setTimeout(()=> {
            this.timer()
        }, 33)
    }

    background() {
        var q = jQuery('#q')[0];
        var width = q.width = document.documentElement.clientWidth;
        var height = q.height = document.documentElement.clientHeight;
        var letters = [];
        for (var i = 0; i < 256; i++) {
            letters.push(Math.round(Math.random() * i * 33))
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
    }

}