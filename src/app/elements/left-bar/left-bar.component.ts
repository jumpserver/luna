import {Component, Inject, OnInit, ViewChild, ElementRef} from '@angular/core';
import {AppService, HttpService, LogService} from '../../app.service';
// import {ElementTreeFilterComponent} from '../tree-filter/tree-filter.component';
import {DataStore} from '../../globals';
import {version} from '../../../environments/environment';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';


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
  selector: 'elements-left-bar',
  templateUrl: './left-bar.component.html',
  styleUrls: ['./left-bar.component.scss'],
  // providers: [ElementTreeFilterComponent]
})
export class ElementLeftBarComponent {
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
    DataStore.showLeftBar = false;
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
    DataStore.showLeftBar = true;
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
              private _logger: LogService,
              public _dialog: MatDialog,
              ) {
    this._logger.log('nav.ts:NavComponent');
  }

  Search(q) {
    // Todo:
    // this._search.Search(q);
  }

  onRightClick(event: MouseEvent): void {
    this.clientX = event.clientX;
    this.clientY = event.clientY;
  }
}
