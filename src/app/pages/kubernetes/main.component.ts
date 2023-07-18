import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {DataStore, User} from '@app/globals';
import {IOutputData, SplitComponent} from 'angular-split';
import {SettingService, ViewService} from '@app/services';
import * as _ from 'lodash';

@Component({
  selector: 'pages-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
})
export class PageK8sComponent implements OnInit {
  @ViewChild(SplitComponent, {read: false, static: false}) split: SplitComponent;
  @ViewChild('leftArea', {static: false}) leftArea: ElementRef;
  @ViewChild('rightArea', {static: false}) rightArea: ElementRef;
  User = User;
  store = DataStore;
  showIframeHider = false;
  showMenu: any = false;
  isK8s: boolean = true;
  menus: Array<object>;
  settingLayoutWidth = {
    leftWidth: '20%',
    rightWidth: '80%'
  };

  constructor(public viewSrv: ViewService,
              public _settingSvc: SettingService) {
  }

  get currentView() {
    return this.viewSrv.currentView;
  }

  ngOnInit(): void {
    this.menus = [
      {
        name: 'assets',
        icon: 'fa-inbox',
        click: (name) => this.menuClick(this.settingLayoutWidth, name),
      }
    ];
  }

  dragStartHandler($event: IOutputData) {
    this.showIframeHider = true;
  }

  dragEndHandler($event: IOutputData) {
    const layoutWidth = $event.sizes[0];
    this.showMenu = layoutWidth < 6;
    this.showIframeHider = false;
  }

  splitGutterClick({gutterNum}: IOutputData) {
    this.split.notify('end', gutterNum);
  }

  menuActive() {
    const settings = _.cloneDeep(this.settingLayoutWidth);
    if (!this.showMenu) {
      settings.leftWidth = '0%';
      settings.rightWidth = '100%';
    }
    setTimeout(() => {
      this.menuClick(settings, '');
    }, 30);
  }

  menuClick(settings = this.settingLayoutWidth, type = '') {
    this.leftArea.nativeElement.style = `min-width: 54px; order: 0; flex: 0 0 calc(${settings.leftWidth} - 0px);`;
    this.rightArea.nativeElement.style = `order: 2; flex: 0 0 calc(${settings.rightWidth} - 0px);`;
    this.showMenu = !this.showMenu;
  }
}
