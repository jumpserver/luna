/**
 * 控制页面
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {AppService} from '../../app.service';
import {DataStore, User} from '../../globals';

@Component({
  selector: 'pages-control',
  templateUrl: './control.component.html',
  styleUrls: ['./control.component.css'],
})
export class PagesControlComponent implements OnInit {
  DataStore = DataStore;
  User = User;

  constructor() {
  }

  ngOnInit() {
  }

}
