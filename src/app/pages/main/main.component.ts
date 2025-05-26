import {Component, ElementRef, HostListener, OnInit, ViewChild} from '@angular/core';
import {DataStore, User} from '@app/globals';
import {IOutputData, SplitComponent} from 'angular-split';
import {HttpService, LogService, SettingService, ViewService} from '@app/services';

import {environment} from '@src/environments/environment';

@Component({
  selector: 'pages-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
})
export class PageMainComponent implements OnInit {
  @ViewChild(SplitComponent, {read: false, static: false}) split: SplitComponent;
  @ViewChild('leftArea', {static: false}) leftArea: ElementRef;
  @ViewChild('rightArea', {static: false}) rightArea: ElementRef;
  User = User;
  store = DataStore;
  showIframeHider = false;
  showSubMenu: any = false;
  isDirectNavigation: boolean;
  settingLayoutSize = {
    leftWidth: 20,
    rightWidth: 80
  };

  constructor(public viewSrv: ViewService,
              private _http: HttpService,
              private _logger: LogService,
              public _settingSvc: SettingService) {
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
    this._http.getUserSession().subscribe();
    this._settingSvc.isDirectNavigation$.subscribe((state) => {
      this.isDirectNavigation = state;
    });

    this.connectWebsocket();
  }

  handleLayoutSettingChange(collapsed: boolean) {
    if (collapsed) {
      this.leftArea.nativeElement.style = 'width: 60px';
      this.rightArea.nativeElement.style = 'width: calc(100% - 60px)';
    } else {
      this.leftArea.nativeElement.style = 'width: 20%';
      this.rightArea.nativeElement.style = 'width: calc(100% - 20%)';
    }
  }

  onToggleMobileLayout() {

  }

  connectWebsocket() {
    const scheme = document.location.protocol === 'https:' ? 'wss' : 'ws';
    const port = document.location.port ? ':' + document.location.port : '';
    const url = '/ws/notifications/site-msg/';
    const wsURL = scheme + '://' + document.location.hostname + port + url;

    const ws = new WebSocket(wsURL);
    ws.onopen = (event) => {
      this._logger.debug('Websocket connected: ', event);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this._logger.debug('Data: ', data);
      } catch (e) {
        this._logger.debug('Recv site message error');
      }
    };
    ws.onerror = (error) => {
      this._logger.debug('site message ws error: ', error);
    };
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    this._http.deleteUserSession().subscribe();
    if (!environment.production || this.isDirectNavigation) {
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

}
