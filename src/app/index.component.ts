/**
 * Created by liuzheng on 2017/8/31.
 */
import {Component} from '@angular/core';
import {AppService} from './app.service';

@Component({
  selector: 'app-root',
  templateUrl: './index.html',
  providers: [AppService],
  // directives: [LeftbarComponent, TermComponent]
})

export class IndexComponent {
  // DataStore = DataStore;
}
