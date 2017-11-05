import {Component, OnInit} from '@angular/core';
import {NavList} from '../console.component'


@Component({
  selector: 'app-consolenav',
  templateUrl: './consolenav.component.html',
  styleUrls: ['./consolenav.component.css']
})
export class ConsolenavComponent implements OnInit {
  setActive = ConsolenavComponent.setActive;
  NavList = NavList;

  constructor() {
  }

  ngOnInit() {
  }

  static checkActive(index) {
    let len = NavList.term.length;
    if (len == 1) {
      // 唯一一个
      NavList.termActive = 0;
    } else if (len - 1 == index) {
      // 删了最后一个
      NavList.termActive = len - 2;
    } else {
      NavList.termActive = index;
    }
    ConsolenavComponent.setActive(NavList.termActive)
  }

  static setActive(index) {
    for (let m in NavList.term) {
      NavList.term[m].hide = true;
    }
    NavList.term[index].hide = false;
    NavList.termActive = index;
  }

}
