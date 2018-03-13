import {Component, OnInit} from '@angular/core';
import {AppService, HttpService, LocalStorageService} from '../app.service';
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
  authToken: string;
  userid: string;
  target: string;
  base: string;

  constructor(private _appService: AppService,
              private _http: HttpService,
              private _localStorage: LocalStorageService) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    this.system = this._appService.getQueryString('system');
    this.token = this._appService.getQueryString('token');

    jQuery('body').css('background-color', 'black');

    this.userid = this._localStorage.get('user-' + this.token);
    this.authToken = this._localStorage.get('authToken-' + this.token);
    this.base = this._localStorage.get('base-' + this.token);

    if (this.system === 'windows') {

      if (!this.userid) {
        this._http.get_user_id_from_token(this.token)
          .subscribe(
            data => {
              this._localStorage.set('user-' + this.token, data['user']);
              this.userid = data['user'];
              this.getAuthToken();
            }
          );
      } else {
        this.getAuthToken();
      }
    }
  }

  getAuthToken() {
    if (!this.authToken) {
      this._http.get_guacamole_token(this.userid, this.token).subscribe(
        data => {
          if (data['authToken']) {
            this._localStorage.set('authToken-' + this.token, data['authToken']);
            this.authToken = data['authToken'];
            this.getBase();
          }
        }
      );
    } else {
      this.getBase();
    }
  }

  getBase() {
    if (!this.base) {
      this._http.guacamole_token_add_asset(this.token, this.authToken).subscribe(
        data => {
          if (data['result']) {
            this._localStorage.set('base-' + this.token, data['result']);
            this.base = data['result'];
            this.setWinTarget();
          }
        });
    } else {
      this.setWinTarget();
    }
  }

  setWinTarget() {
    if (this.base && this.authToken) {
      this.target = document.location.origin + '/guacamole/#/client/' + this.base +
        '?asset_token=jumpserver&token=' + this.authToken;
    } else {
      window.location.reload();
    }
  }

}
