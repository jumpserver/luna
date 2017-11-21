/**
 * 主页的左边栏
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';

import {AppService, DataStore} from '../../app.service';

@Component({
  selector: 'app-ileftbar',
  templateUrl: './ileftbar.component.html',
  styleUrls: ['./ileftbar.component.css']
})
export class IleftbarComponent implements OnInit {

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
  }

}
