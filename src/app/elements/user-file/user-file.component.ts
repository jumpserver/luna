import {Component, OnInit} from '@angular/core';
import {HttpService} from '@app/services';

interface MenuItem {
  id: string;
  name: string;
  click: Function;
}

@Component({
  selector: 'elements-user-file',
  templateUrl: './user-file.component.html',
  styleUrls: ['./user-file.component.scss'],
})
export class ElementUserFileComponent implements OnInit {
  menus: Array<MenuItem>;

  constructor(private _http: HttpService) {}

  ngOnInit() {
    this.init();
  }

  init() {
    this.menus = [
      {
        id: 'logout',
        name: 'Log out',
        click: () => {
          window.location.href = document.location.origin + '/core/auth/logout/';
        },
      }
    ];
  }
}
