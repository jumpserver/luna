import {Component, Output, EventEmitter} from '@angular/core';
import {DataStore} from '@app/globals';
import {version} from '@src/environments/environment';
import {SettingService} from '@app/services';


@Component({
  selector: 'elements-left-bar',
  templateUrl: './left-bar.component.html',
  styleUrls: ['./left-bar.component.scss'],
})
export class ElementLeftBarComponent {
  @Output() menuActive = new EventEmitter();

  constructor(public _settingSvc: SettingService) {
  }

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

  toggle() {
    this.iconActive = !this.iconActive;
    this.menuActive.emit();
  }
}
