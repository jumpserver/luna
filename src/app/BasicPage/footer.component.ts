/**
 * Created by liuzheng on 2017/8/30.
 */

import {Component} from '@angular/core';
import {Logger} from 'angular2-logger/core';

import {AppService, DataStore} from '../app.service';


@Component({
  selector: 'app-footer',
  templateUrl: './footer.html',
  // directives: [NgClass]
})


export class FooterComponent {
  // DataStore = DataStore;

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

}
