import { Component, HostListener, OnInit } from "@angular/core";
import { DataStore, User } from "@app/globals";
import {
  HttpService,
  LogService,
  SettingService,
  ViewService,
} from "@app/services";
import { environment } from "@src/environments/environment";

@Component({
  standalone: false,
  selector: "pages-main",
  templateUrl: "main.component.html",
  styleUrls: ["main.component.scss"],
})
export class PageMainComponent implements OnInit {
  User = User;
  store = DataStore;
  showIframeHider = false;
  showSubMenu: any = false;
  isDirectNavigation: boolean;
  settingLayoutSize = {
    leftWidth: "20%",
    rightWidth: "80%",
  };
  collapsed = false;

  constructor(
    public viewSrv: ViewService,
    private _http: HttpService,
    private _logger: LogService,
    public _settingSvc: SettingService
  ) {}

  get currentView() {
    return this.viewSrv.currentView;
  }

  get showSplitter() {
    if (this.currentView && this.currentView.type === "rdp") {
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
    this.settingLayoutSize.leftWidth = collapsed ? "60" : "20%";
  }

  onToggleMobileLayout() {}

  connectWebsocket() {
    const scheme = document.location.protocol === "https:" ? "wss" : "ws";
    const port = document.location.port ? ":" + document.location.port : "";
    const url = "/ws/notifications/site-msg/";
    const wsURL = scheme + "://" + document.location.hostname + port + url;

    const ws = new WebSocket(wsURL);
    ws.onopen = (event) => {
      this._logger.debug("Websocket connected: ", event);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this._logger.debug("Data: ", data);
      } catch (e) {
        this._logger.debug("Recv site message error");
      }
    };
    ws.onerror = (error) => {
      this._logger.debug("site message ws error: ", error);
    };
  }

  @HostListener("window:beforeunload", ["$event"])
  unloadNotification($event: any) {
    this._http.deleteUserSession().subscribe();
    if (!environment.production || this.isDirectNavigation) {
      return;
    }

    const notInIframe = window.self === window.top;
    const notInReplay = location.pathname.indexOf("/luna/replay") === -1;
    const returnValue = !(notInIframe && notInReplay);
    if (returnValue) {
      $event.returnValue = true;
    }
    return returnValue;
  }

  dragResize($event) {
    let leftWidth = $event[0];
    let rightWidth = $event[1];

    if (leftWidth < 100 && !this.collapsed) {
      leftWidth = 60;
      rightWidth = window.innerWidth - leftWidth;
      this.collapsed = true;
    } else if (leftWidth > 100 && this.collapsed) {
      leftWidth = "20%";
      rightWidth = "80%";
      this.collapsed = false;
    }
    this.settingLayoutSize.leftWidth = leftWidth;
    this.settingLayoutSize.rightWidth = rightWidth;
  }

  dragStartHandler($event) {}

  dragEndHandler($event) {}
}
