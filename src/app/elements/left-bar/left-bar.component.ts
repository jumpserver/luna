import {Component} from '@angular/core';
import {DataStore} from '@app/globals';
import {version} from '@src/environments/environment';


@Component({
  selector: 'elements-left-bar',
  templateUrl: './left-bar.component.html',
  styleUrls: ['./left-bar.component.scss'],
})
export class ElementLeftBarComponent {
  DataStore = DataStore;
  version = version;

  static Hide() {
    DataStore.showLeftBar = false;
    window.dispatchEvent(new Event('resize'));
  }

  static Show() {
    DataStore.showLeftBar = true;
    window.dispatchEvent(new Event('resize'));
  }

}
