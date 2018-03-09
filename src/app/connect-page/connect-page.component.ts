import {Component, OnInit} from '@angular/core';
import {AppService} from '../app.service';
import {DataStore} from '../globals';
import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'app-connect-page',
  templateUrl: './connect-page.component.html',
  styleUrls: ['./connect-page.component.scss']
})
export class ConnectPageComponent implements OnInit {
  token: string;
  system: string;

  constructor(private _appService: AppService) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    this.system = this._appService.getQueryString('system');
    this.token = this._appService.getQueryString('token');

    jQuery('body').css('background-color', 'black');

  }

}
