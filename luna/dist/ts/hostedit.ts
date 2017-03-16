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
    selector: 'div',
    template: `<div style="background-color: #fff;">
<table class="ui red table">
  <thead>
    <tr><th>Food</th>
    <th>Calories</th>
    <th>Protein</th>
  </tr></thead><tbody>
    <tr>
      <td>Apples</td>
      <td>200</td>
      <td>0g</td>
    </tr>
    <tr>
      <td>Orange</td>
      <td>310</td>
      <td>0g</td>
    </tr>
  </tbody>
</table>
</div>`,
})


export class HostEditComponent {
    DataStore = DataStore;

    constructor(private _appService:AppService,
                private _logger:Logger) {
        this._logger.log('SomeComponent.ts:SomeComponent');
    }

    ngOnInit() {

    }

}