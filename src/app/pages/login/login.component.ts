/**
 * 登陆页
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {AppService, HttpService, LogService} from '@app/services';
import {NgForm} from '@angular/forms';
import {Router} from '@angular/router';
import {DataStore, User} from '@app/globals';
import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'pages-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class PagesLoginComponent implements OnInit {
  DataStore = DataStore;
  User = User;
  loginBotton = 'login to your account';

  constructor(private _appService: AppService,
              private _http: HttpService,
              private _router: Router,
              private _logger: LogService) {
    this._logger.log('login.ts:LoginComponent');
    DataStore.NavShow = false;
  }


  onSubmit(f: NgForm) {
    if (f.valid) {
      this.login();
    } else {
      this._logger.error('the form not valid');
    }
  }

  login() {
    this._logger.log('service.ts:AppService,login');
    DataStore.error['login'] = '';
    this._logger.log(User);
    if (User.username.length > 0 && User.password.length > 6 && User.password.length < 100) {
      this._http.checkLogin(JSON.stringify(User))
        .subscribe(
          data => {
            User.logined = data['logined'];
            User.name = data['name'];
            User.username = data['username'];
            User.logined = data['logined'];
          },
          err => {
            this._logger.error(err);
            User.logined = false;
            this._router.navigate(['login']);
            DataStore.error['login'] = '后端错误,请重试';
            return '后端错误,请重试';
          },
          () => {
            if (User.logined) {
              if (jQuery.isEmptyObject(DataStore.Path)) {
                this._router.navigate(['welcome']);
              } else {
                this._router.navigate([DataStore.Path['name'], DataStore.Path['res']]);
              }
            } else {
              this._router.navigate(['login']);
              DataStore.error['login'] = '请检查用户名和密码';
              return '请检查用户名和密码';
            }
            // jQuery('angular2').show();

          });
    } else {
      DataStore.error['login'] = '请检查用户名和密码';
      return '请检查用户名和密码';
    }
  }

  ngOnInit() {
    jQuery('#form').fadeIn('slow');
    // this._router.navigate(['login']);
    // jQuery('nav').hide();
  }
}
