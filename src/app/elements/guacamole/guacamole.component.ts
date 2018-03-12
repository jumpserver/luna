import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {HttpService, LogService} from '../../app.service';
import {DataStore, User} from '../../globals';
import {DomSanitizer} from '@angular/platform-browser';
import {environment} from '../../../environments/environment';
import {NavList} from '../../ControlPage/control/control.component';

@Component({
  selector: 'app-element-guacamole',
  templateUrl: './guacamole.component.html',
  styleUrls: ['./guacamole.component.scss']
})
export class ElementGuacamoleComponent implements OnInit {
  @Input() host: any;
  @Input() userid: any;
  @Input() token: string;
  @Input() index: number;
  target: string;
  @ViewChild('rdp') el: ElementRef;

  constructor(private sanitizer: DomSanitizer,
              private _http: HttpService,
              private _cookie: CookieService,
              private _logger: LogService) {
  }

  ngOnInit() {
    // /guacamole/api/tokens will redirect to http://guacamole/api/tokens
    if (this.token) {
      if (User.id) {
        this._http.get_user_profile()
          .subscribe(
            data => {
              User.id = data['id'];
              User.name = data['name'];
              User.username = data['username'];
              User.email = data['email'];
              User.is_active = data['is_active'];
              User.is_superuser = data['is_superuser'];
              User.role = data['role'];
              // User.groups = data['groups'];
              User.wechat = data['wechat'];
              User.comment = data['comment'];
              User.date_expired = data['date_expired'];
              if (data['phone']) {
                User.phone = data['phone'].toString();
              }
              User.logined = data['logined'];
              this._http.get_guacamole_token(User.id).subscribe(
                data2 => {
                  DataStore.guacamole_token = data2['authToken'];
                  this._http.guacamole_token_add_asset(this.token).subscribe(
                    _ => {
                      this.target = document.location.origin + '/guacamole/#/client/' + data['result'] + '?token=' + DataStore.guacamole_token;
                    },
                    error2 => {
                      this._logger.error(error2);
                    }
                  );
                });
            },
            err => {
              User.logined = false;
              window.location.href = document.location.origin + '/users/login?next=' + document.location.pathname;
            },
          );
      } else {
        this._http.get_guacamole_token(User.id).subscribe(
          data => {
            DataStore.guacamole_token = data['authToken'];
            this._http.guacamole_token_add_asset(this.token).subscribe(
              _ => {
                this.target = document.location.origin + '/guacamole/#/client/' + data['result'] + '?token=' + DataStore.guacamole_token;
              },
              error2 => {
                this._logger.error(error2);
              }
            );
          });
      }
    } else {
      const base = window.btoa(this.host.id + '\0' + 'c' + '\0' + 'jumpserver');
      if (environment.production) {
        if (DataStore.guacamole_token) {
          this._http.guacamole_add_asset(User.id, this.host.id, this.userid).subscribe(
            data => {
              this.target = document.location.origin + '/guacamole/#/client/' + base + '?token=' + DataStore.guacamole_token;
            },
            error2 => {
              this._logger.error(error2);
            }
          );
        } else {
          this._http.get_guacamole_token(User.id).subscribe(
            data => {
              // /guacamole/client will redirect to http://guacamole/#/client
              DataStore.guacamole_token = data['authToken'];

              this._http.guacamole_add_asset(User.id, this.host.id, this.userid).subscribe(
                data2 => {
                  this.target = document.location.origin + '/guacamole/#/client/' + base + '?token=' + DataStore.guacamole_token;
                },
                error2 => {
                  this._logger.error(error2);
                }
              );
              // '/guacamole/#/client/' + base + '?token=' + data['authToken'];
            },
            error2 => {
              this._logger.error(error2);
            }
          );
        }
      } else {
        this.target = this._cookie.get('guacamole');
      }
    }

    NavList.List[this.index].Rdp = this.el.nativeElement;
  }

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  Disconnect() {
    NavList.List[this.index].connected = false;
  }

  active() {
    this._logger.debug('focus');
    this.el.nativeElement.focus();
  }

}
