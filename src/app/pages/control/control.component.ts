/**
 * 控制页面
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {DataStore, User} from '../../globals';
import {NavList} from './control/control.component';

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

  activeViewIsRdp() {
    return NavList.List[NavList.Active].type === 'rdp';
  }

  dragSplitBtn(evt) {
    window.dispatchEvent(new Event('resize'));
  }

  ngOnInit() {
  }

}
