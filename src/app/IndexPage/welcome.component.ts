/**
 * Created by liuzheng on 2017/8/31.
 */

import {Component} from '@angular/core';
import {AppService, User} from '../app.service';

@Component({
  templateUrl: './welcome.html',
  providers: [AppService]
  // directives: [LeftbarComponent, TermComponent]
})

export class WelcomeComponent {
  // DataStore = DataStore;
  User = User;

  // DataStore = DataStore;
}
