import {Component, HostListener, OnInit, ViewChild, ElementRef} from '@angular/core';
import {DataStore, User} from '@app/globals';
import {IOutputData, SplitComponent} from 'angular-split';
import {environment} from '@src/environments/environment';
import {ViewService} from '@app/services';

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
        name: '我的资产',
        icon: 'fa-inbox',
      },
      {
        name: '我的应用',
        icon: 'fa-th',
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
      if (this.showMenu) {
        this.showMenu = false;
      }
    }, 320);
  }

  dragEndHandler($event: IOutputData) {
    console.log('$event: ', $event);
    const layoutWidth = $event.sizes[0];
    this.showMenu = layoutWidth < 4 ? true : false;
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
    let leftWidth = '20%';
    let rightWidth = '80%';
    if (!this.showMenu) {
      leftWidth = '0%';
      rightWidth = '100%';
    }
    setTimeout(() => {
      this.leftArea.nativeElement.style = `min-width: 54px; max-width: 50%; order: 0; flex: 0 0 calc(${leftWidth} - 0px);`;
      this.rightArea.nativeElement.style = `order: 2; flex: 0 0 calc(${rightWidth} - 0px);`;
      this.showMenu = !this.showMenu;
    }, 100);
  }
}
