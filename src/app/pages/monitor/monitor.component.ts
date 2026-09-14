import {Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {HttpService, I18nService, SettingService} from '@app/services';
import {ActivatedRoute} from '@angular/router';
import {Asset, Session, Ticket, User} from '@app/model';
import {NzNotificationService} from 'ng-zorro-antd/notification';
import {getWaterMarkContent} from '@app/utils/common';
import {joinEndpointUrl} from '@app/utils/path';
import {combineLatest, firstValueFrom, from, Subject, TimeoutError} from 'rxjs';
import {takeUntil, timeout} from 'rxjs/operators';

@Component({
  standalone: false,
  selector: 'pages-monitor',
  templateUrl: 'monitor.component.html',
  styleUrls: ['monitor.component.scss']
})
export class PagesMonitorComponent implements OnInit, OnDestroy {
  @ViewChild('contentWindow', {static: true}) windowRef: ElementRef;
  iframeURL: string;
  sessionDetail: Session = null;
  sessionID: string;
  isPaused: boolean = false;
  ticketID: string;
  ticketDetail: Ticket;
  supportedLock: boolean = false;
  user: User;
  loading = false;
  errorMessage = '';
  loginRequired = false;
  loadingStage = '';
  private readonly destroy$ = new Subject<void>();
  private readonly loadCancelled$ = new Subject<void>();
  private requestController: AbortController;
  private loadSequence = 0;
  private readonly requestTimeout = 15000;

  constructor(private _settingSvc: SettingService,
              private _http: HttpService,
              private _route: ActivatedRoute,
              private _toastr: NzNotificationService,
              private _i18n: I18nService) {}

  ngOnInit() {
    combineLatest([this._route.params, this._route.queryParams])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([params, queryParams]) => {
        this.sessionID = params['sid'];
        this.ticketID = queryParams['ticket_id'];
        this.loadMonitor();
      });
  }

  ngOnDestroy() {
    this.loadSequence++;
    this.requestController?.abort();
    this.loadCancelled$.next();
    this.loadCancelled$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get loginUrl(): string {
    return this._http.getLoginUrl();
  }

  private waitFor<T>(request: Promise<T>, milliseconds = this.requestTimeout): Promise<T> {
    return firstValueFrom(from(request).pipe(timeout(milliseconds), takeUntil(this.loadCancelled$)));
  }

  private async optionalWatermarkDetail<T>(request: Promise<T>, fallback: T): Promise<T> {
    try {
      return await this.waitFor(request, 5000) || fallback;
    } catch (error) {
      if (error.status === 401) {
        throw error;
      }
      // Keep the existing fallback for unavailable asset/session-user metadata.
      return fallback;
    }
  }

  async loadMonitor() {
    const sequence = ++this.loadSequence;
    this.requestController?.abort();
    this.loadCancelled$.next();
    const controller = new AbortController();
    this.requestController = controller;
    const control = {signal: controller.signal, timeout: this.requestTimeout};
    this.loading = true;
    this.errorMessage = '';
    this.loginRequired = false;
    this.iframeURL = null;
    this.sessionDetail = null;
    this.ticketDetail = null;
    this.supportedLock = false;
    this.loadingStage = 'Session details';
    try {
      if (!this.sessionID) {
        throw new Error('Invalid session ID');
      }
      const session = await this.waitFor(this._http.getSessionDetail(this.sessionID, control));
      if (sequence !== this.loadSequence) {
        return;
      }
      if (!session?.terminal?.type || !session.type?.value) {
        throw new Error('Invalid session response');
      }
      this.sessionDetail = session;
      this.loadingStage = 'Monitor initialization';
      const protocol = window.location.protocol.replace(':', '');
      const data = {assetId: '', sessionId: this.sessionID, token: ''};
      const [user, endpoint, , ticket] = await this.waitFor(Promise.all([
        this._http.getUserProfile(control),
        this._http.getSmartEndpoint(data, protocol, control),
        this._settingSvc.init(control),
        this.ticketID ? this._http.getTicketDetail(this.ticketID, control) : Promise.resolve(null)
      ]));
      if (sequence !== this.loadSequence) {
        return;
      }
      if (!user?.username || !endpoint) {
        throw new Error('Invalid monitor response');
      }
      const iframeURL = this.generateMonitorURL(endpoint.getUrl(), session.terminal.type);
      this.user = user;
      this.ticketDetail = ticket;
      if (this._settingSvc.globalSetting.SECURITY_WATERMARK_ENABLED) {
        this.loadingStage = 'Watermark initialization';
        const detailControl = {...control, timeout: 5000};
        const [asset, sessionUser] = await Promise.all([
          this.optionalWatermarkDetail(this._http.getAssetDetail(session.asset_id, detailControl).toPromise(), new Asset()),
          this.optionalWatermarkDetail(this._http.getUserDetail(session.user_id, detailControl), new User())
        ]);
        if (sequence !== this.loadSequence) {
          return;
        }
        const auditorUser = `${this._i18n.instant('Viewer')}: ${user.name}(${user.username})`;
        const sessionContent = getWaterMarkContent(sessionUser, asset, this._settingSvc);
        await this.waitFor(this._settingSvc.createWaterMarkIfNeed(
          this.windowRef.nativeElement, `${auditorUser}\n${sessionContent}`, control));
        if (sequence !== this.loadSequence) {
          return;
        }
      }
      this.isPaused = session.is_locked;
      this.supportedLock = ['koko', 'lion', 'chen'].includes(session.terminal.type) && session.type.value === 'normal';
      this.iframeURL = iframeURL;
    } catch (error) {
      if (sequence !== this.loadSequence) {
        return;
      }
      this.loginRequired = error.status === 401;
      const messages = {
        0: 'Unable to reach the server. Check your network and retry.',
        401: 'Your login has expired or you are not signed in.',
        403: 'You do not have permission to access the requested resource.',
        404: 'The requested resource does not exist or is no longer available.'
      };
      this.errorMessage = error instanceof TimeoutError ? 'The request timed out. Please retry.' :
        messages[error.status] || 'Initialization failed. Please retry or contact the administrator.';
      console.warn('Monitor initialization failed', {stage: this.loadingStage, status: error.status});
    } finally {
      // Cancel every outstanding request in this attempt, including siblings of a failed request.
      controller.abort();
      if (sequence === this.loadSequence) {
        this.loading = false;
      }
    }
  }

  private generateMonitorURL(baseUrl: string, terminalType: string): string {
    switch (terminalType) {
      case 'razor':
        return joinEndpointUrl(baseUrl, `/razor/monitor/${this.sessionID}/`);
      case 'lion':
        return joinEndpointUrl(baseUrl, `/lion/monitor/?session=${this.sessionID}`);
      default:
        return joinEndpointUrl(baseUrl, `/koko/monitor/${this.sessionID}/`);
    }
  }

  togglePause($event) {
    if (!this.sessionDetail) {
      return;
    }
    if (this.sessionDetail.is_finished) {
      return;
    }
    if (this.ticketID && !this.ticketDetail) {
      this._http.toggleLockSessionForTicket(this.ticketID, this.sessionID, !this.isPaused
      ).then((res) => {
        this.handleToggleResponse(res).then();
      });
    } else {
      this._http.toggleLockSession(this.sessionID, !this.isPaused).then((res) => {
        this.handleToggleResponse(res).then();
      });
    }
  }

  async handleToggleResponse(res) {
    const pauseTaskMsg = await this._i18n.t('Pause task has been send');
    const resumeTaskMsg = await this._i18n.t('Resume task has been send');
    const session_ids = res['ok'];
    const msg = this.isPaused ? resumeTaskMsg : pauseTaskMsg;
    this._toastr.success(msg, '', {nzClass: 'custom-success-notification'});
    if (session_ids.indexOf(this.sessionID) !== -1) {

    }
    this.isPaused = !this.isPaused;
  }
}
