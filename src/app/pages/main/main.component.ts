import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { DataStore, User } from '@app/globals';
import { HttpService, I18nService, LogService, SettingService, ViewService } from '@app/services';
import { environment } from '@src/environments/environment';
import { toAbsoluteWsUrl, withAppBase } from '@app/utils/path';
import { NzModalRef, NzModalService } from 'ng-zorro-antd/modal';

interface SiteMessagePopup {
  id: string;
  subject: string;
  message: string;
}

function createSessionClientId(): string {
  if (typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

@Component({
  standalone: false,
  selector: 'pages-main',
  templateUrl: 'main.component.html',
  styleUrls: ['main.component.scss']
})
export class PageMainComponent implements OnInit, OnDestroy {
  User = User;
  store = DataStore;
  showIframeHider = false;
  showSubMenu: any = false;
  isDirectNavigation: boolean;
  settingLayoutSize: {
    leftWidth: string | number;
    rightWidth: string | number | undefined;
  } = {
    leftWidth: '20%',
    rightWidth: '80%'
  };
  collapsed = false;
  private popupMessages: SiteMessagePopup[] = [];
  private popupDialogRef: NzModalRef | null = null;
  private currentPopupMessage: SiteMessagePopup | null = null;
  private readonly userSessionClientId = createSessionClientId();
  private userSessionHeartbeatInterval = 30 * 1000;
  private userSessionHeartbeatTimer: number | null = null;
  private userSessionHeartbeatInFlight = false;
  private userSessionReleased = false;

  constructor(
    public viewSrv: ViewService,
    private _http: HttpService,
    private _logger: LogService,
    public _settingSvc: SettingService,
    private _dialog: NzModalService,
    private _i18n: I18nService
  ) {}

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
    this.renewUserSession();
    this._settingSvc.isDirectNavigation$.subscribe(state => {
      this.isDirectNavigation = state;
    });

    this.connectWebsocket();
  }

  ngOnDestroy(): void {
    this.stopUserSessionHeartbeat();
  }

  private renewUserSession() {
    if (this.userSessionHeartbeatInFlight) {
      return;
    }

    this.stopUserSessionHeartbeat();
    this.userSessionHeartbeatInFlight = true;
    this._http.renewUserSession(this.userSessionClientId).subscribe({
      next: data => {
        this.userSessionHeartbeatInFlight = false;
        if (data?.ok === false) {
          this.userSessionReleased = true;
          this.stopUserSessionHeartbeat();
          return;
        }
        this.userSessionReleased = false;
        const interval = Number(data?.heartbeat_interval);
        if (interval > 0) {
          this.userSessionHeartbeatInterval = interval * 1000;
        }
        this.scheduleUserSessionHeartbeat();
      },
      error: () => {
        this.userSessionHeartbeatInFlight = false;
        this.stopUserSessionHeartbeat();
      }
    });
  }

  private scheduleUserSessionHeartbeat() {
    this.stopUserSessionHeartbeat();
    if (this.userSessionReleased) {
      return;
    }
    this.userSessionHeartbeatTimer = window.setTimeout(
      () => this.renewUserSession(),
      this.userSessionHeartbeatInterval
    );
  }

  private stopUserSessionHeartbeat() {
    if (this.userSessionHeartbeatTimer !== null) {
      window.clearTimeout(this.userSessionHeartbeatTimer);
      this.userSessionHeartbeatTimer = null;
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.renewUserSession();
    }
  }

  @HostListener('window:pageshow')
  onPageShow() {
    this.userSessionReleased = false;
    this.renewUserSession();
  }

  @HostListener('window:pagehide', ['$event'])
  onPageHide($event: PageTransitionEvent) {
    if ($event.persisted || this.userSessionReleased) {
      return;
    }

    this.userSessionReleased = true;
    this.stopUserSessionHeartbeat();
    this._http.releaseUserSessionOnPageHide(this.userSessionClientId).catch(() => {});
  }

  handleLayoutSettingChange(collapsed: boolean) {
    this.collapsed = collapsed;
    if (collapsed) {
      this.settingLayoutSize.leftWidth = 60;
      this.settingLayoutSize.rightWidth = undefined;
    } else {
      this.settingLayoutSize.leftWidth = '20%';
      this.settingLayoutSize.rightWidth = '80%';
    }
  }

  onToggleMobileLayout() {}

  connectWebsocket() {
    const ws = new WebSocket(toAbsoluteWsUrl('/ws/notifications/site-msg/'));
    ws.onopen = event => {
      this._logger.debug('Websocket connected: ', event);
    };
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        this._logger.debug('Data: ', data);
        if (this.isPopupMessage(data)) {
          this.enqueuePopupMessage(data);
        }
      } catch (e) {
        this._logger.debug('Recv site message error');
      }
    };
    ws.onerror = error => {
      this._logger.debug('site message ws error: ', error);
    };
  }

  private isPopupMessage(data: any): boolean {
    const siteMsg = data?.site_msg || data?.site_meg;
    const content = siteMsg?.content || siteMsg;
    return data?.type === 'display' && !!siteMsg?.id && content?.display_mode === 'popup';
  }

  private normalizePopupMessage(data: any): SiteMessagePopup {
    const siteMsg = data.site_msg || data.site_meg;
    const content = siteMsg.content || siteMsg;

    return {
      id: siteMsg.id,
      subject: content.subject || this._i18n.instant('SiteMessage'),
      message: content.message || ''
    };
  }

  private enqueuePopupMessage(data: any) {
    const msg = this.normalizePopupMessage(data);
    const isCurrentMsg = this.currentPopupMessage?.id === msg.id;
    const isQueuedMsg = this.popupMessages.some(item => item.id === msg.id);

    if (msg.id && (isCurrentMsg || isQueuedMsg)) {
      return;
    }

    this.popupMessages.push(msg);
    this.showNextPopupMessage();
  }

  private showNextPopupMessage() {
    if (this.popupDialogRef || this.popupMessages.length === 0) {
      return;
    }

    const msg = this.popupMessages.shift();
    if (!msg) {
      return;
    }
    this.currentPopupMessage = msg;
    this.popupDialogRef = this._dialog.create({
      nzTitle: msg.subject,
      nzContent: msg.message,
      nzOkText: this._i18n.instant('MarkAsRead'),
      nzCancelText: this._i18n.instant('Cancel'),
      nzOnOk: () => this.markPopupAsRead(msg)
    });
    this.popupDialogRef.afterClose.subscribe(() => {
      this.popupDialogRef = null;
      this.currentPopupMessage = null;
      this.showNextPopupMessage();
    });
  }

  private markPopupAsRead(msg: SiteMessagePopup): Promise<void> {
    const url = '/api/v1/notifications/site-messages/mark-as-read/';
    return new Promise((resolve, reject) => {
      this._http.patch(url, { ids: [msg.id] }).subscribe({
        next: () => resolve(),
        error: error => reject(error)
      });
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    if (!environment.production || this.isDirectNavigation) {
      return;
    }

    const notInIframe = window.self === window.top;
    const notInReplay = location.pathname.indexOf(withAppBase('/replay')) === -1;
    const returnValue = !(notInIframe && notInReplay);
    if (returnValue) {
      $event.returnValue = true;
    }
    return returnValue;
  }

  dragResize($event: any) {
    let leftWidth = $event[0];
    let rightWidth = $event[1];

    if (leftWidth < 100 && !this.collapsed) {
      leftWidth = 60;
      rightWidth = undefined;
      this.collapsed = true;
    } else if (leftWidth > 100 && this.collapsed) {
      leftWidth = '20%';
      rightWidth = '80%';
      this.collapsed = false;
    }
    this.settingLayoutSize.leftWidth = leftWidth;
    this.settingLayoutSize.rightWidth = rightWidth;
  }

  dragStartHandler($event: any) {}

  dragEndHandler($event: any) {}
}
