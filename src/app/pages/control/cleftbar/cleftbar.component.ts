/**
 * 控制页面的左边栏主机树状页
 *
 * 以树状方式列出所有主机
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */

import {Component, Inject, OnInit, ViewChild, ElementRef} from '@angular/core';
import {AppService, HttpService, LogService} from '../../../app.service';
import {SearchComponent} from '../search/search.component';
import {DataStore} from '../../../globals';
import {version} from '../../../../environments/environment';
import {NavList, View} from '../control/control.component';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {ElementServerMenuComponent} from '../../../elements/server-menu/server-menu.component';
import {DialogService} from '../../../elements/dialog/dialog.service';


export interface Node {
  id: string;
  name: string;
  comment: string;
  title: string;
  isParent: boolean;
  pId: string;
  open: boolean;
  iconSkin: string;
  meta: object;
}

export class Host {
  name: string;
  id: string;
  type: string;
}

@Component({
  selector: 'pages-control-cleftbar',
  templateUrl: './cleftbar.component.html',
  styleUrls: ['./cleftbar.component.scss'],
  providers: [SearchComponent, ElementServerMenuComponent]
})
export class CleftbarComponent {
  DataStore = DataStore;
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
        if (DataStore.Nav[i]['children'][key]['id'] === 'HideLeftManager') {
          DataStore.Nav[i]['children'][key] = {
            'id': 'ShowLeftManager',
            'click': 'ShowLeft',
            'name': 'Show left manager'
          };
        }
      });
    });
    window.dispatchEvent(new Event('resize'));
  }

  static Show() {
    DataStore.leftbarshow = true;
    DataStore.Nav.map(function (value, i) {
      value['children'].forEach((v, key) => {
        if (DataStore.Nav[i]['children'][key]['id'] === 'ShowLeftManager') {
          DataStore.Nav[i]['children'][key] = {
            'id': 'HideLeftManager',
            'click': 'HideLeft',
            'name': 'Hide left manager'
          };
        }
      });
    });
    window.dispatchEvent(new Event('resize'));
  }

  constructor(private _appService: AppService,
              private _http: HttpService,
              private _search: SearchComponent,
              private _logger: LogService,
              private _menu: ElementServerMenuComponent,
              public _dialog: MatDialog,
              private _layer: DialogService) {
    this._logger.log('nav.ts:NavComponent');
  }

  Search(q) {
    this._search.Search(q);
  }

  onRightClick(event: MouseEvent): void {
    this.clientX = event.clientX;
    this.clientY = event.clientY;
  }
}
