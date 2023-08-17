import {Component, ElementRef, HostListener, OnInit, ViewChild} from '@angular/core';
import {DataStore, User} from '@app/globals';
import {IOutputData, SplitComponent} from 'angular-split';
import {SettingService, ViewService} from '@app/services';
import * as _ from 'lodash';
import {environment} from '@src/environments/environment';

@Component({
  selector: 'pages-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css'],
})
export class PageMainComponent implements OnInit {
  @ViewChild(SplitComponent, {read: false, static: false}) split: SplitComponent;
  @ViewChild('leftArea', {static: false}) leftArea: ElementRef;
  @ViewChild('rightArea', {static: false}) rightArea: ElementRef;
  User = User;
  store = DataStore;
  showIframeHider = false;
  showSubMenu: any = false;
  menus: Array<object>;
  settingLayoutSize = {
    leftWidth: 20,
    rightWidth: 80
  };

  constructor(public viewSrv: ViewService,
              public _settingSvc: SettingService) {
  }

  _isMobile = false;

  get isMobile() {
    return this._isMobile;
  }

  set isMobile(value) {
    this._isMobile = value;
    let settings: any = {};
    if (!value) {
      settings = this.settingLayoutSize;
      this.showSubMenu = true;
    } else {
      settings.leftWidth = '100';
      settings.rightWidth = '0';
      this.showSubMenu = false;
    }
    setTimeout(() => {
      this.menuClick(settings);
    }, 10);
  }

  _overlayMenu = false;

  get overlayMenu() {
    return this._overlayMenu;
  }

  set overlayMenu(value) {
    this._overlayMenu = value;
    const settings: any = {};
    if (this.isMobile) {
      if (this.overlayMenu) {
        settings.leftWidth = '100';
        settings.rightWidth = '0';
      } else {
        settings.leftWidth = '0';
        settings.rightWidth = '100';
      }
    }
    setTimeout(() => {
      this.menuClick(settings);
    }, 10);
  }

  get currentView() {
    return this.viewSrv.currentView;
  }

  get showSplitter() {
    if (this.currentView && this.currentView.type === 'rdp') {
      return false;
    }
    return this.store.showLeftBar;
  }

  ngOnInit(): void {
    this.menus = [
      {
        name: 'assets',
        icon: 'fa-inbox',
        click: () => this.menuClick(this.settingLayoutSize),
      },
      {
        name: 'applications',
        icon: 'fa-th',
        click: () => this.menuClick(this.settingLayoutSize),
      }
    ];
    this.onResize(window);
    window.addEventListener('resize', _.debounce(this.onResize, 300));
  }

  onResize(event) {
    const width = event.currentTarget ? event.currentTarget.innerWidth : event.innerWidth;
    if (width < 768) {
      this.isMobile = true;
      this.overlayMenu = true;
    } else {
      this.isMobile = false;
    }
  }


  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    if (!environment.production) {
      return;
    }
    const notInIframe = window.self === window.top;
    const notInReplay = location.pathname.indexOf('/luna/replay') === -1;
    const returnValue = !(notInIframe && notInReplay);
    if (returnValue) {
      $event.returnValue = true;
    }
    return returnValue;
  }

  dragStartHandler($event: IOutputData) {
    this.showIframeHider = true;
  }

  dragEndHandler($event: IOutputData) {
    const layoutWidth = $event.sizes[0];
    this.showSubMenu = layoutWidth < 6;
    this.showIframeHider = false;
  }

  splitGutterClick({gutterNum}: IOutputData) {
    // By default, clicking the gutter without changing position does not trigger the 'dragEnd' event
    // This can be fixed by manually notifying the component
    // See issue: https://github.com/angular-split/angular-split/issues/186
    // TODO: Create custom example for this, and document it
    this.split.notify('end', gutterNum);
  }

  menuActive() {
    const settings = _.cloneDeep(this.settingLayoutSize);
    if (this.isMobile) {
      this.onToggleMobileLayout();
      if (this.overlayMenu) {
        settings.leftWidth = '100';
        settings.rightWidth = '0';
      } else {
        settings.leftWidth = '0';
        settings.rightWidth = '100';
      }
    } else {
      if (this.showSubMenu) {
        settings.leftWidth = '20';
        settings.rightWidth = '80';
      } else {
        settings.leftWidth = '0';
        settings.rightWidth = '100';
      }
    }
    setTimeout(() => {
      this.menuClick(settings);
    }, 30);
  }

  menuClick(settings = this.settingLayoutSize) {
    let leftAreaStyle = `order: 0; flex: 0 0 ${settings.leftWidth}%!important;`;
    let rightAreaStyle = `order: 2; flex: 0 0 ${settings.rightWidth}%!important;`;
    if (!this.isMobile) {
      leftAreaStyle = leftAreaStyle + ' min-width: 54px;';
      rightAreaStyle = rightAreaStyle + ' max-width: calc(100% - 54px);';
      this.showSubMenu = !this.showSubMenu;
    }
    this.leftArea.nativeElement.style = leftAreaStyle;
    this.rightArea.nativeElement.style = rightAreaStyle;
  }

  onToggleMobileLayout() {
    if (this.isMobile) {
      this.overlayMenu = !this.overlayMenu;
    }
  }
}
