import {Component, HostListener, OnInit, ViewChild} from '@angular/core';
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
  User = User;
  store = DataStore;
  showIframeHider = false;

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
  }

  dragEndHandler($event: IOutputData) {
    this.showIframeHider = false;
  }

  splitGutterClick({ gutterNum }: IOutputData) {
    // By default, clicking the gutter without changing position does not trigger the 'dragEnd' event
    // This can be fixed by manually notifying the component
    // See issue: https://github.com/angular-split/angular-split/issues/186
    // TODO: Create custom example for this, and document it
    this.split.notify('end', gutterNum);
  }
}
