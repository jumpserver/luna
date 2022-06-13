import {Component, HostListener, OnInit, ViewChild, ElementRef} from '@angular/core';
import {DataStore, User} from '@app/globals';
import {IOutputData, SplitComponent} from 'angular-split';
import {ViewService} from '@app/services';
import * as _ from 'lodash';
declare var $: any;

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
  showMenu: any = false;
  menus: Array<object>;
  settingLayoutWidth = {
    leftWidth: '20%',
    rightWidth: '80%'
  };

  constructor(public viewSrv: ViewService) {}

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
        click: (name) => this.menuClick(this.settingLayoutWidth, name),
      },
      {
        name: 'applications',
        icon: 'fa-th',
        click: (name) => this.menuClick(this.settingLayoutWidth, name),
      }
    ];
  }

  dragSplitBtn(evt) {
    window.dispatchEvent(new Event('resize'));
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    const notInIframe = window.self === window.top;
    const notInReplay = location.pathname.indexOf('/luna/replay') === -1;
    return !(notInIframe && notInReplay);
  }
  dragStartHandler($event: IOutputData) {
    this.showIframeHider = true;
    setTimeout(() => {
      this.showMenu = !this.showMenu;
    }, 400);
  }

  dragEndHandler($event: IOutputData) {
    const layoutWidth = $event.sizes[0];
    this.showMenu = layoutWidth < 6;
    this.showIframeHider = false;
  }

  splitGutterClick({ gutterNum }: IOutputData) {
    // By default, clicking the gutter without changing position does not trigger the 'dragEnd' event
    // This can be fixed by manually notifying the component
    // See issue: https://github.com/angular-split/angular-split/issues/186
    // TODO: Create custom example for this, and document it
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
