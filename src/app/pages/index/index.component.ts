/**
 * 主页
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {AppService} from '../../app.service';
import {User} from '../../globals';

@Component({
  selector: 'pages-index',
  templateUrl: './index.component.html',
  styleUrls: ['./index.component.css'],
})
export class PagesIndexComponent implements OnInit {
  User = User;

  constructor() {
  }

  ngOnInit() {
  }

}
