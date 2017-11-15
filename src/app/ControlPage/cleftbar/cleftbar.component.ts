/**
 * 控制页面的左边栏主机树状页
 *
 * 以树状方式列出所有主机
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';

import {AppService, DataStore, HttpService} from '../../app.service';
import {SshComponent} from '../control/ssh/ssh.component';
import {RdpComponent} from "../control/rdp/rdp.component";

declare let jQuery: any;

export class HostGroup {
  name: string;
  id: string;
  children: Array<Host>;
}

export class Host {
  name: string;
  uuid: string;
  type: string;
  token: string;
  machine: string;
}

@Component({
  selector: 'app-cleftbar',
  templateUrl: './cleftbar.component.html',
  styleUrls: ['./cleftbar.component.css'],
  providers: [SshComponent, RdpComponent]
})
export class CleftbarComponent implements OnInit {
  DataStore = DataStore;
  HostGroups: Array<HostGroup>;

  static Reload() {
  }

  static Hide() {
  }

  static Show() {
  }

  constructor(private _appService: AppService,
              private _term: SshComponent,
              private _rdp: RdpComponent,
              private _http: HttpService,
              private _logger: Logger) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
    this._http.get('/api/hostlist')
      .map(res => res.json())
      .subscribe(response => {
        this.HostGroups = response;
      });
  }


  Connect(host) {
    if (host.type === 'ssh') {
      jQuery("app-ssh").show();
      jQuery("app-rdp").hide();
      this._term.TerminalConnect(host);
    } else {
      jQuery("app-ssh").hide();
      jQuery("app-rdp").show();
      this._rdp.Connect(host);
    }
  }

}
