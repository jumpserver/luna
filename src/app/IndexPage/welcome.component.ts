/**
 * Created by liuzheng on 2017/8/31.
 */
<<<<<<< HEAD:src/app/welcome.component.ts
import {Component, OnInit} from '@angular/core';
import {AppService, DataStore, User} from './app.service';
=======
import {Component} from '@angular/core';
import {AppService} from '../app.service';
>>>>>>> master:src/app/IndexPage/welcome.component.ts

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
