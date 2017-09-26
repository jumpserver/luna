/**
 * Created by liuzheng on 2017/8/31.
 */
import {Component, OnInit} from '@angular/core';
import {AppService, DataStore, User} from '../app.service';

@Component({
  selector: 'app-root',
  templateUrl: './main.html',
  styleUrls: ['./main.css'],
  providers: [AppService],
})

export class TermPage {
  DataStore = DataStore;
  User = User;

  // DataStore = DataStore;
}
