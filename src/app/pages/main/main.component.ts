import {Component, OnInit} from '@angular/core';
import {DataStore, User} from '../../globals';
import {NavList} from '../control/control/control.component';

@Component({
  selector: 'pages-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css'],
})
export class PageMainComponent implements OnInit {
  User = User;
  DataStore = DataStore;

  ngOnInit(): void {
  }

  activeViewIsRdp() {
    return NavList.List[NavList.Active].type === 'rdp';
  }

  dragSplitBtn(evt) {
    window.dispatchEvent(new Event('resize'));
  }
}
