import {Component, OnInit} from '@angular/core';
import {AppService, DataStore, User} from '../app.service';

@Component({
  selector: 'app-consolepage',
  templateUrl: './consolepage.component.html',
  styleUrls: ['./consolepage.component.css'],
  providers: [AppService]

})
export class ConsolePageComponent implements OnInit {
  DataStore = DataStore;
  User = User;

  constructor() {
  }

  ngOnInit() {
  }

}
