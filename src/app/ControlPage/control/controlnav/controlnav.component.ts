import {Component, OnInit} from '@angular/core';
import {NavList} from '../control.component'
declare let jQuery: any;


@Component({
  selector: 'app-controlnav',
  templateUrl: './controlnav.component.html',
  styleUrls: ['./controlnav.component.css']
})
export class ControlnavComponent implements OnInit {
  setActive = ControlnavComponent.setActive;
  NavList = NavList;

  constructor() {
  }

  ngOnInit() {
  }

  static checkActive(index) {
    let len = NavList.List.length;
    if (len == 1) {
      // 唯一一个
      NavList.Active = 0;
    } else if (len - 1 == index) {
      // 删了最后一个
      NavList.Active = len - 2;
    } else {
      NavList.Active = index;
    }
    ControlnavComponent.setActive(NavList.Active)
  }

  static setActive(index) {
    for (let m in NavList.List) {
      NavList.List[m].hide = true;
    }
    NavList.List[index].hide = false;
    NavList.Active = index;
    if (NavList.List[index].type === "ssh") {
      jQuery("#ssh").show();
      jQuery("#rdp").hide()
    } else {
      jQuery("#ssh").hide();
      jQuery("#rdp").show()
    }
  }

}
