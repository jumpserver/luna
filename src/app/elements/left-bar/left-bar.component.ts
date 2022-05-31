import {Component, Output, EventEmitter} from '@angular/core';
import {DataStore} from '@app/globals';
import {version} from '@src/environments/environment';

@Component({
  selector: 'elements-left-bar',
  templateUrl: './left-bar.component.html',
  styleUrls: ['./left-bar.component.scss'],
})
export class ElementLeftBarComponent {
  @Output() menuActive = new EventEmitter();

  DataStore = DataStore;
  version = version;
  iconActive = false;

  static Hide() {
    DataStore.showLeftBar = false;
    window.dispatchEvent(new Event('resize'));
  }

  static Show() {
    DataStore.showLeftBar = true;
    window.dispatchEvent(new Event('resize'));
  }

  active() {
    this.iconActive = !this.iconActive;
    this.menuActive.emit();
  }
}
