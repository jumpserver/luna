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

import {AppService, DataStore} from '../../app.service';
import {SshComponent} from '../control/ssh/ssh.component';
import {RdpComponent} from "../control/rdp/rdp.component";

declare let jQuery: any;

@Component({
  selector: 'app-cleftbar',
  templateUrl: './cleftbar.component.html',
  styleUrls: ['./cleftbar.component.css'],
  providers: [SshComponent, RdpComponent]
})
export class CleftbarComponent implements OnInit {
  DataStore = DataStore;
  HostGroups = [
    {
      name: "ops",
      id: "ccc",
      children: [
        {
          name: "ops-linux",
          uuid: "xxxx",
          type: "ssh",
          token: "sshxxx"
        }, {
          name: "ops-win",
          uuid: "win-aasdf",
          type: "rdp",
          token: "rdpxxx",
          machine: "sss"
        }
      ],
    }];

  constructor(private _appService: AppService,
              private _term: SshComponent,
              private _rdp: RdpComponent,
              private _logger: Logger) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
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
