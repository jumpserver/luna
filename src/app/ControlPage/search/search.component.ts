/**
 * 控制页面的搜索框
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnChanges, Input} from '@angular/core';
import {Logger} from 'angular2-logger/core';

import {AppService, DataStore} from '../../app.service';

@Component({
  selector: 'app-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.css']
})
export class SearchComponent implements OnChanges {

  @Input() input;
  q: string;


  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('LeftbarComponent.ts:SearchBar');
  }

  ngOnChanges(changes) {
    this.q = changes.input.currentValue;
  }

  modelChange($event) {
    this._appService.Search(this.q)
  }

  search() {
    this._appService.Search(this.q)
  }
}
