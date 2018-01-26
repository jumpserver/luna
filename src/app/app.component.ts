/**
 * 控制主页
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component} from '@angular/core';
import {AppService, HttpService} from './app.service';
import {DataStore} from './globals';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  // directives: [LeftbarComponent, TermComponent]
})

export class AppComponent {
  DataStore = DataStore;
}
