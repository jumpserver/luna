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
  providers: [AppService, User]
})
// ToDo: ngEnter and redirect to default page

export class LoginComponent implements OnInit {
  DataStore = DataStore;

  constructor(private _appService: AppService,
              private _logger: Logger,
              public user: User) {
    this._logger.log('login.ts:LoginComponent');
  }


  onSubmit(f: NgForm) {
    if (f.valid) {
      this.user.username = f.value.email;
      this.user.password = f.value.password;
      this._appService.login(this.user);
    } else {
      this._logger.error("the form not valid")
    }
  }

  ngOnInit() {

  }

}
