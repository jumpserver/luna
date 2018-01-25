/**
 * 控制页面的左边栏主机树状页
 *
 * 以树状方式列出所有主机
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, OnInit} from '@angular/core';
import {AppService, HttpService, LogService} from '../../app.service';
import {SearchComponent} from '../search/search.component';
import {DataStore} from '../../globals';
import {version} from '../../../environments/environment';
import * as jQuery from 'jquery/dist/jquery.min.js';
import * as layer from 'layui-layer/src/layer.js';
import * as UUID from 'uuid-js/lib/uuid.js';
import {ElementServerMenuComponent} from '../../elements/server-menu/server-menu.component';
import {NavList, View} from '../control/control.component';
import {logger} from 'codelyzer/util/logger';


export interface HostGroup {
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
  providers: [SearchComponent, ElementServerMenuComponent]
})
export class CleftbarComponent implements OnInit {
  DataStore = DataStore;
  HostGroups: Array<HostGroup>;
  version = version;
  q: string;
  event: MouseEvent;
  clientX = 0;
  clientY = 0;

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
              private _http: HttpService,
              private _search: SearchComponent,
              private _logger: LogService,
              private _menu: ElementServerMenuComponent) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
    this._http.get_my_asset_groups_assets()
      .subscribe(response => {
        this.HostGroups = response;
        this.autologin();
      });
  }

  autologin() {
    const id = this._appService.getQueryString('id');
    if (id) {
      for (let g of this.HostGroups) {
        if (g['assets_granted']) {
          for (let u of g['assets_granted']) {
            if (u.id.toString() === id.toString()) {
              this.Connect(u);
              return;
            }
          }
        }
      }

    }
  }

  Connect(host) {
    // console.log(host);
    let user: any;
    let options = '';
    const that = this;
    if (host.system_users_granted.length > 1) {
      user = this.checkPriority(host.system_users_granted);
      if (user) {
        this.login(host, user);
      } else {
        for (const u of host.system_users_granted) {
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
            const userid = jQuery('#selectuser').val();
            for (let i of host.system_users_granted) {
              if (i.id.toString() === userid.toString()) {
                user = i;
                break;
              }
            }
            that.login(host, user);
            layer.close(index);
          },
          btn2: function (index, layero) {
          },
          cancel: function () {
            // 右上角关闭回调
            // return false 开启该代码可禁止点击该按钮关闭
          }
        });
      }
    } else if (host.system_users_granted.length === 1) {
      user = host.system_users_granted[0];
      this.login(host, user);
    }
  }

  login(host, user) {
    const id = NavList.List.length - 1;
    if (user) {
      NavList.List[id].nick = host.hostname;
      NavList.List[id].connected = true;
      NavList.List[id].edit = false;
      NavList.List[id].closed = false;
      NavList.List[id].host = host;
      NavList.List[id].user = user;
      if (user.protocol === 'ssh') {
        NavList.List[id].type = 'ssh';
      } else if (user.protocol === 'rdp') {
        NavList.List[id].type = 'rdp';
      }
      NavList.List.push(new View());
      NavList.Active = id;
    }
  }

  checkPriority(sysUsers) {
    let priority: number = -1;
    let user: any;
    for (const u of sysUsers) {
      if (u.priority > priority) {
        user = u;
        priority = u.priority;
      } else if (u.priority === priority) {
        return null;
      }
    }
    return user;
  }

  Search(q) {
    this._search.Search(q);
  }

  onRightClick(event: MouseEvent): void {
    this.clientX = event.clientX;
    this.clientY = event.clientY;
    // console.log(this.clientX, this.clientY);
    // this._menu.contextmenu(this.clientY, this.clientX);
  }
}
