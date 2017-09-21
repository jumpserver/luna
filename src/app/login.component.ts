/**
 * Created by liuzheng on 2017/9/16.
 */

import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';
import {AppService, DataStore, User} from './app.service';
import {NgForm} from '@angular/forms';

declare let jQuery: any;

@Component({
  selector: 'app-root',
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
  providers: [AppService]
})
// ToDo: ngEnter and redirect to default page

export class LoginComponent implements OnInit {
  DataStore = DataStore;
  User = User;
  loginBotton = 'login to your account';

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('login.ts:LoginComponent');
  }


  onSubmit(f: NgForm) {
    if (f.valid) {
      this._appService.login();
    } else {
      this._logger.error("the form not valid")
    }
  }

  ngOnInit() {

  }

}
