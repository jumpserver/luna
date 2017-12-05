/**
 * 主页
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {AppService, User} from '../app.service';

@Component({
  selector: 'app-index-page',
  templateUrl: './index-page.component.html',
  styleUrls: ['./index-page.component.css'],
  providers: [AppService]
})
export class IndexPageComponent implements OnInit {
  User = User;

  constructor() {
  }

  ngOnInit() {
  }

}
