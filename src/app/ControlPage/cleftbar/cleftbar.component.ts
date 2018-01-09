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

import {AppService, HttpService} from '../../app.service';
import {SshComponent} from '../control/ssh/ssh.component';
import {RdpComponent} from '../control/rdp/rdp.component';
import {SearchComponent} from '../search/search.component';
import {DataStore} from '../../globals';
import {version} from '../../../environments/environment';
import * as jQuery from 'jquery/dist/jquery.min.js';
import * as layer from 'layui-layer/src/layer.js';


export class HostGroup {
  name: string;
  id: string;
  children: Array<Host>;
}

export class Host {
  name: string;
  id: string;
  type: string;
}

@Component({
  selector: 'app-cleftbar',
  templateUrl: './cleftbar.component.html',
  styleUrls: ['./cleftbar.component.css'],
  providers: [SshComponent, RdpComponent, SearchComponent]
})
export class CleftbarComponent implements OnInit {
  DataStore = DataStore;
  HostGroups: Array<HostGroup>;
  version = version;
  q: string;

  static Reload() {
  }

  static Hide() {
    DataStore.leftbarshow = false;
    DataStore.Nav.map(function (value, i) {
      for (var ii in value['children']) {
        if (DataStore.Nav[i]['children'][ii]['id'] === 'HindLeftManager') {
          DataStore.Nav[i]['children'][ii] = {
            'id': 'ShowLeftManager',
            'click': 'ShowLeft',
            'name': 'Show left manager'
          };
        }
      }
    });
  }

  static Show() {
    DataStore.leftbarshow = true;
    DataStore.Nav.map(function (value, i) {
      for (var ii in value['children']) {
        if (DataStore.Nav[i]['children'][ii]['id'] === 'ShowLeftManager') {
          DataStore.Nav[i]['children'][ii] = {
            'id': 'HindLeftManager',
            'click': 'HideLeft',
            'name': 'Hind left manager'
          };
        }
      }
    });
  }

  constructor(private _appService: AppService,
              private _term: SshComponent,
              private _rdp: RdpComponent,
              private _http: HttpService,
              private _search: SearchComponent,
              private _logger: Logger) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
    this._http.get('/api/perms/v1/user/my/asset-groups-assets/')
      .map(res => res.json())
      .subscribe(response => {
        this.HostGroups = response;
      });
  }

  Connect(host) {
    // console.log(host);
    let userid: string;
    const that = this;
    if (host.system_users_granted.length > 1) {
      let options = '';
      for (let u of host.system_users_granted) {
        options += '<option value="' + u.id + '">' + u.username + '</option>';
      }
      layer.open({
        title: 'Please Choose a User',
        scrollbar: false,
        moveOut: true,
        moveType: 1,
        btn: ['确定', '取消'],
        content: '<select id="selectuser">' + options + '</select>',
        yes: function (index, layero) {
          userid = jQuery('#selectuser').val();
          if (host.plantform === 'Linux') {
            jQuery('app-ssh').show();
            jQuery('app-rdp').hide();
            that._term.TerminalConnect(host, userid);
          } else if (host.plantform === 'Windows') {
            jQuery('app-ssh').hide();
            jQuery('app-rdp').show();
            that._rdp.Connect(host, userid);
          } else {
            jQuery('app-ssh').show();
            jQuery('app-rdp').hide();
            that._term.TerminalConnect(host, userid);
          }
          layer.close(index);
        },
        btn2: function (index, layero) {
        },
        cancel: function () {
          // 右上角关闭回调
          // return false 开启该代码可禁止点击该按钮关闭
        }
      });
    } else if (host.system_users_granted.length === 1) {
      userid = host.system_users_granted[0].id;
      if (userid === '') {
        return;
      }
      if (host.plantform === 'Linux') {
        jQuery('app-ssh').show();
        jQuery('app-rdp').hide();
        this._term.TerminalConnect(host, userid);
      } else if (host.plantform === 'Windows') {
        jQuery('app-ssh').hide();
        jQuery('app-rdp').show();
        this._rdp.Connect(host, userid);
      } else {
        jQuery('app-ssh').show();
        jQuery('app-rdp').hide();
        this._term.TerminalConnect(host, userid);
      }
    }
  }

  Search(q) {
    this._search.Search(q);
  }

}
