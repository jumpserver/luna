import {Component, OnInit} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {HttpService} from '@app/services';

interface MenuItem {
  id: string;
  name: string;
  click: string;
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
        click: 'logout',
      }
    ];
  }
  click(event) {
    switch (event) {
      case 'logout': {
        this.logout();
        break;
      }
      default: {
        break;
      }
    }
  }
  logout() {
    window.location.href = document.location.origin + '/core/auth/logout/';
  }
}
