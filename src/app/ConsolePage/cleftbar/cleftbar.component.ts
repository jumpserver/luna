import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';

import {AppService, DataStore} from '../../app.service';
import {SshComponent} from '../console/ssh/ssh.component';

@Component({
  selector: 'app-cleftbar',
  templateUrl: './cleftbar.component.html',
  styleUrls: ['./cleftbar.component.css'],

  providers: [SshComponent]

})
export class CleftbarComponent implements OnInit {
  DataStore = DataStore;
  HostGroups = [
    {
      name: "msa-us",
      id: "ccc",
      children: [
        {
          name: "ops-redis",
          uuid: "xxxx",
          type: "ssh"
        }, {
          name: "ops-win",
          uuid: "win-aasdf",
          type: "rdp"
        }
      ],
    }];

  constructor(private _appService: AppService,
              private _term: SshComponent,
              private _logger: Logger) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
  }


  Connect(host) {
    if (host.type === 'ssh') {
      this._term.TerminalConnect(host.uuid);
    } else {

    }
  }

}
