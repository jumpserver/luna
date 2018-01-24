/**
 * footer
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {AppService, LogService} from '../../app.service';
import {DataStore, User} from '../../globals';
import {version} from '../../../environments/environment';

@Component({
  selector: 'app-element-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class ElementFooterComponent implements OnInit {
  DataStore = DataStore;
  User = User;
  version = version;

  constructor(private _appService: AppService,
              private _logger: LogService) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
  }

}
