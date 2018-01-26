/**
 * 主页的左边栏
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {AppService, LogService} from '../../app.service';

@Component({
  selector: 'app-ileftbar',
  templateUrl: './ileftbar.component.html',
  styleUrls: ['./ileftbar.component.css']
})
export class IleftbarComponent implements OnInit {

  constructor(private _appService: AppService,
              private _logger: LogService) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
  }

}
