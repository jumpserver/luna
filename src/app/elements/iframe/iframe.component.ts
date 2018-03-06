import {Component, Input, OnInit} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {NavList} from '../../ControlPage/control/control.component';

import {User, guacamole} from '../../globals';
import {HttpService, LogService} from '../../app.service';

@Component({
  selector: 'app-element-iframe',
  templateUrl: './iframe.component.html',
  styleUrls: ['./iframe.component.scss']
})
export class ElementIframeComponent implements OnInit {
  @Input() host: any;
  @Input() userid: any;
  @Input() index: number;
  target: string;

  constructor(private sanitizer: DomSanitizer,
              private _http: HttpService,
              private _logger: LogService) {
  }

  ngOnInit() {
    // /guacamole/api/tokens will redirect to http://guacamole/api/tokens
    const base = window.btoa(this.host.hostname + '\0' + 'c' + '\0' + 'jumpserver');
    if (guacamole.token) {
      this.target = document.location.origin + '/guacamole/#/client/' + base + '?token=' + guacamole.token;
    } else {
      this._http.get_guacamole_token(User.name, this.host.id, this.userid).subscribe(
        data => {
          // /guacamole/client will redirect to http://guacamole/#/client
          this.target = document.location.origin +
            '/guacamole/#/client/' + base + '?token=' + data['authToken'];
          guacamole.token = data['authToken'];
        },
        error2 => {
          this._logger.error(error2);
        }
      );
    }
  }

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  Disconnect() {
    NavList.List[this.index].connected = false;
  }
}
