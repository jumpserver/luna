/**
 * 控制主页
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, HostListener} from '@angular/core';
import {DataStore} from '../globals';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})

export class AppComponent {
  DataStore = DataStore;

  constructor() {}

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    if (environment.production) {
      $event.returnValue = true;
    }
  }
}

