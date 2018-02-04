import {Component, OnInit} from '@angular/core';
import {DialogService} from '../dialog/dialog.service';


export class Menu {
  name: string;
  type: string;
  action: any;
}

@Component({
  selector: 'app-element-server-menu',
  templateUrl: './server-menu.component.html',
  styleUrls: ['./server-menu.component.scss'],
})
export class ElementServerMenuComponent implements OnInit {
  MenuList: Array<any>;
  top: number;
  left: number;

  constructor(private _dialog: DialogService) {
  }

  ngOnInit() {
    const m = new Menu();
    const line = new Menu();
    m.action = '';
    m.name = 'test';
    m.type = 'lll';
    line.type = 'line';
    this.MenuList = [m, m, line, m, m];
    this._dialog.alert();
  }

  public contextmenu(top: number, left: number) {
    this.top = top;
    this.left = left;
  }

}
