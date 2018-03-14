import {Component, Input, OnInit} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {NavList} from '../../ControlPage/control/control.component';

import {User, DataStore} from '../../globals';
import {HttpService, LogService} from '../../app.service';
import {environment} from '../../../environments/environment';
import {CookieService} from 'ngx-cookie-service';

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
              private _cookie: CookieService,
              private _logger: LogService) {
  }

  ngOnInit() {
  }

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  Disconnect() {
    NavList.List[this.index].connected = false;
  }
}
