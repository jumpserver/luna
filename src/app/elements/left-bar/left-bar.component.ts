import {Component, Output, EventEmitter} from '@angular/core';
import {DataStore} from '@app/globals';
import {version} from '@src/environments/environment';
import {OrganizationService, SettingService} from '@app/services';


@Component({
  selector: 'elements-left-bar',
  templateUrl: './left-bar.component.html',
  styleUrls: ['./left-bar.component.scss'],
})
export class ElementLeftBarComponent {
  @Output() menuActive = new EventEmitter();
  showTree = true;
  version = version;
  iconActive = false;

  constructor(public _settingSvc: SettingService,
              private _orgSvc: OrganizationService
  ) {
    this.onOrgChangeReloadTree();
  }

  static Hide() {
    DataStore.showLeftBar = false;
    window.dispatchEvent(new Event('resize'));
  }

  static Show() {
    DataStore.showLeftBar = true;
    window.dispatchEvent(new Event('resize'));
  }

  onOrgChangeReloadTree() {
    this._orgSvc.currentOrgChange$.subscribe(() => {
      this.showTree = false;
      setTimeout(() => this.showTree = true, 100);
    });
  }

  toggle() {
    this.iconActive = !this.iconActive;
    this.menuActive.emit();
  }
}
