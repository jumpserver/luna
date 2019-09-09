import {Component} from '@angular/core';
import {DataStore} from '../globals';
import {AppService} from '../app.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})

export class AppComponent {
  DataStore = DataStore;

  constructor(appSrv: AppService) {
  }
}

