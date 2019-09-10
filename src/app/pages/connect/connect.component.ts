import {Component, OnInit} from '@angular/core';
import {AppService, HttpService, LocalStorageService} from '@app/app.service';
import {connectEvt} from '@app/globals';
import {ConnectEvt} from '@app/model';
// import {DataStore} from '@app/globals';
// import * as jQuery from 'jquery/dist/jquery.min.js';
import {View, ViewAction} from '@app/model';

@Component({
  selector: 'pages-connect',
  templateUrl: './connect.component.html',
  styleUrls: ['./connect.component.scss']
})
export class PagesConnectComponent implements OnInit {
  token: string;
  system: string;
  view: View;

  constructor(private _appService: AppService,
              private _http: HttpService,
              private _localStorage: LocalStorageService) {
  }

  onNewView(view) {
    view.active = true;
    this.view = view;
  }

  ngOnInit() {
    this.system = this._appService.getQueryString('system');
    this.token = this._appService.getQueryString('token');
    const assetId = this._appService.getQueryString('asset');
    const remoteAppId = this._appService.getQueryString('remote_app');
    if (assetId) {
      this._http.filterMyGrantedAssetsById(assetId).subscribe(
        nodes => {
          if (!nodes) {
            return;
          }
          const evt = new ConnectEvt(nodes[0], 'asset');
          connectEvt.next(evt);
        }
      );
    }
    if (remoteAppId) {
      this._http.getMyGrantedRemoteApps(remoteAppId).subscribe(
        nodes => {
          if (!nodes) {
            return;
          }
          const evt = new ConnectEvt(nodes[0], 'asset');
          connectEvt.next(evt);
        }
      );
    }
  }
}
