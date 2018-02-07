/**
 * 控制页面的左边栏主机树状页
 *
 * 以树状方式列出所有主机
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, Inject, OnInit} from '@angular/core';
import {AppService, HttpService, LogService} from '../../app.service';
import {SearchComponent} from '../search/search.component';
import {DataStore} from '../../globals';
import {version} from '../../../environments/environment';
import {ElementServerMenuComponent} from '../../elements/server-menu/server-menu.component';
import {NavList, View} from '../control/control.component';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {FormControl, Validators} from '@angular/forms';
import {DialogService} from '../../elements/dialog/dialog.service';


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
  TooltipPosition = 'above';

  static Reload() {
  }

  static Hide() {
    DataStore.leftbarshow = false;
    DataStore.Nav.map(function (value, i) {
      value['children'].forEach((v, key) => {
        if (DataStore.Nav[i]['children'][key]['id'] === 'HindLeftManager') {
          DataStore.Nav[i]['children'][key] = {
            'id': 'ShowLeftManager',
            'click': 'ShowLeft',
            'name': 'Show left manager'
          };
        }
      });
    });
  }

  static Show() {
    DataStore.leftbarshow = true;
    DataStore.Nav.map(function (value, i) {
      value['children'].forEach((v, key) => {
        if (DataStore.Nav[i]['children'][key]['id'] === 'ShowLeftManager') {
          DataStore.Nav[i]['children'][key] = {
            'id': 'HindLeftManager',
            'click': 'HideLeft',
            'name': 'Hind left manager'
          };
        }
      });
    });
  }

  constructor(private _appService: AppService,
              private _http: HttpService,
              private _search: SearchComponent,
              private _logger: LogService,
              private _menu: ElementServerMenuComponent,
              public _dialog: MatDialog,
              private _layer: DialogService) {
    this._logger.log('nav.ts:NavComponent');
    // this._appService.getnav()
  }

  ngOnInit() {
    this._http.get_my_asset_groups_assets()
      .subscribe(response => {
        this.HostGroups = response;
        if (!DataStore.autologin) {
          this.autologin();
        }
      });
  }

  autologin() {
    const asset_id = this._appService.getQueryString('asset_id');
    const user_id = this._appService.getQueryString('user_id');
    let tag = false;
    if (asset_id) {
      for (let g of this.HostGroups) {
        if (g['assets_granted']) {
          for (let host of g['assets_granted']) {
            if (host.id.toString() === asset_id) {
              if (user_id) {
                host['system_users_granted'].forEach((user, kk) => {
                  if (user.id.toString() === user_id.toString()) {
                    this.login(host, user);
                    tag = true;
                    return;
                  }
                });
              } else {
                this.Connect(host);
                tag = true;
                return;
              }
            }
          }
        }
      }
    }
    if (!tag) {
      this._layer.alert('Maybe you do not have permission on that host');
    }
    DataStore.autologin = true;
  }

  Connect(host) {
    // console.log(host);
    let user: any;
    if (host.system_users_granted.length > 1) {
      user = this.checkPriority(host.system_users_granted);
      if (user) {
        this.login(host, user);
      } else {
        const dialogRef = this._dialog.open(CleftbarDialogComponent, {
          height: '200px',
          width: '300px',
          data: {users: host.system_users_granted}
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result) {
            for (let i of host.system_users_granted) {
              if (i.id.toString() === result.toString()) {
                user = i;
                break;
              }
            }
            this.login(host, user);
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
    let priority = -1;
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


@Component({
  selector: 'app-cleftbar-dialog',
  templateUrl: 'dialog.html',
})
export class CleftbarDialogComponent implements OnInit {
  UserSelectControl = new FormControl('', [Validators.required]);
  selected: any;

  constructor(public dialogRef: MatDialogRef<CleftbarDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any,
              private _logger: LogService) {
  }

  ngOnInit() {
    this.selected = this.data.users[0].id;
    this.UserSelectControl.setValue(this.selected);
    // this._logger.debug(this.UserSelectControl);
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  compareFn: ((f1: any, f2: any) => boolean) | null = this.compareByValue;

  compareByValue(f1: any, f2: any) {
    return f1 && f2 && f1.value === f2.value;
  }
}
