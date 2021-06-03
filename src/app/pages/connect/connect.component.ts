import {Component, OnInit} from '@angular/core';
import {AppService} from '@app/services';
import {View} from '@app/model';

@Component({
  selector: 'pages-connect',
  templateUrl: './connect.component.html',
  styleUrls: ['./connect.component.scss']
})
export class PagesConnectComponent implements OnInit {
  token: string;
  system: string;
  view: View;

  constructor(private _appService: AppService) {
  }

  onNewView(view) {
    view.active = true;
    this.view = view;
  }

  ngOnInit() {
    this.system = this._appService.getQueryString('system');
    this.token = this._appService.getQueryString('token');
  }
}
