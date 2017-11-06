import {Component, OnInit} from '@angular/core';
import {AppService, DataStore, User} from '../app.service';

@Component({
  selector: 'app-controllpage',
  templateUrl: './controlpage.component.html',
  styleUrls: ['./controlpage.component.css'],
  providers: [AppService]

})
export class ControlPageComponent implements OnInit {
  DataStore = DataStore;
  User = User;

  constructor() {
  }

  ngOnInit() {
  }

}
