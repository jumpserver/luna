/**
 * Created by liuzheng on 2017/8/31.
 */
import {Component} from '@angular/core';
import {AppService, HttpService} from './app.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [AppService, HttpService],
  // directives: [LeftbarComponent, TermComponent]
})

export class AppComponent {
  // DataStore = DataStore;
}
