import {Component, Input, OnInit} from '@angular/core';
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
  @Input() index: number;
  target: string;

  constructor(private sanitizer: DomSanitizer,
              private _http: HttpService,
              private _cookie: CookieService,
              private _logger: LogService) {
  }

  ngOnInit() {
    // /guacamole/api/tokens will redirect to http://guacamole/api/tokens
    const base = window.btoa(this.host.id + '\0' + 'c' + '\0' + 'jumpserver');
    if (environment.production) {
      if (DataStore.guacamole_token) {
        this.target = document.location.origin + '/guacamole/#/client/' + base + '?token=' + DataStore.guacamole_token;
      } else {
        this._http.get_guacamole_token(User.name, this.host.id, this.userid).subscribe(
          data => {
            // /guacamole/client will redirect to http://guacamole/#/client
            this.target = document.location.origin +
              '/guacamole/#/client/' + base + '?token=' + data['authToken'];
            DataStore.guacamole_token = data['authToken'];
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

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  Disconnect() {
    NavList.List[this.index].connected = false;
  }

}
