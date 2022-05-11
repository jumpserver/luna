import {Component, OnInit} from '@angular/core';
import {HttpService} from '@app/services';
import {User} from '@app/globals';

interface MenuItem {
  id: string;
  name: string;
  click: Function;
}

@Component({
  selector: 'elements-user-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ElementUserFileComponent implements OnInit {
  menus: Array<MenuItem>;
  user: object;
  constructor(private _http: HttpService) {}

  ngOnInit() {
    this.init();
    this.user = User;
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
