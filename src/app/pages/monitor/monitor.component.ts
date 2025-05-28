import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {HttpService, I18nService, SettingService} from '@app/services';
import {ActivatedRoute} from '@angular/router';
import {Session, Ticket, User} from '@app/model';
import {NzNotificationService} from 'ng-zorro-antd/notification';
import {getWaterMarkContent} from '@app/utils/common';

@Component({
  standalone: false,
  selector: 'pages-monitor',
  templateUrl: 'monitor.component.html',
  styleUrls: ['monitor.component.scss']
})
export class PagesMonitorComponent implements OnInit {
  @ViewChild('contentWindow', {static: false}) windowRef: ElementRef;
  iframeURL: string;
  sessionDetail: Session = null;
  sessionID: string;
  isPaused: boolean = false;
  ticketID: string;
  ticketDetail: Ticket;
  supportedLock: boolean = false;
  user: User;

  constructor(private _settingSvc: SettingService,
              private _http: HttpService,
              private _route: ActivatedRoute,
              private _toastr: NzNotificationService,
              private _i18n: I18nService) {
    this.getCurrentUser();
  }

  getCurrentUser() {
    this._http.getUserProfile().then(user => {
      this.user = user;
    });
  }

  async ngOnInit() {
    this._route.params.subscribe(params => {
      this.sessionID = params['sid'];
      this.generateMonitorURL().then(async () => {
        const sessionObj = this.sessionDetail;
        const asset = await this._http.getAssetDetail(sessionObj.asset_id).toPromise();
        const sessionUser = await this._http.getUserDetail(sessionObj.user_id);
        const auditorUser = `${this._i18n.instant('Viewer')}: ${this.user.name}(${this.user.username})`;
        const sessionContent = getWaterMarkContent(sessionUser, asset, this._settingSvc);
        const content = `${auditorUser}\n${sessionContent}`;
        this._settingSvc.createWaterMarkIfNeed(
          this.windowRef.nativeElement, content);
      });
    });
    this._route.queryParams.subscribe(params => {
      this.ticketID = params['ticket_id'];
      if (this.ticketID) {
        this._http.getTicketDetail(this.ticketID).then((res) => {
          this.ticketDetail = res;
        });
      }
    });
  }

  async generateMonitorURL() {
    this.sessionDetail = await this._http.getSessionDetail(this.sessionID);
    const supportedType = ['koko', 'lion', 'chen'];
    const isSupportComponent = supportedType.includes(this.sessionDetail.terminal.type);
    const isNormalSession = this.sessionDetail.type.value === 'normal';
    this.supportedLock = isSupportComponent && isNormalSession;
    this.isPaused = this.sessionDetail.is_locked;
    const protocol = window.location.protocol.replace(':', '');
    const data = {'assetId': '', 'appId': '', 'sessionId': this.sessionID, 'token': ''};
    const smartEndpoint = await this._http.getSmartEndpoint(data, protocol);
    const baseUrl = smartEndpoint.getUrl();
    const terminal_type = this.sessionDetail.terminal.type;
    switch (terminal_type) {
      case 'razor':
        this.iframeURL = `${baseUrl}/razor/monitor/${this.sessionID}/`;
        break;
      case 'lion':
        this.iframeURL = `${baseUrl}/lion/monitor/?session=${this.sessionID}`;
        break;
      default:
        this.iframeURL = `${baseUrl}/koko/monitor/${this.sessionID}/`;
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
    this._toastr.success(msg, '');
    if (session_ids.indexOf(this.sessionID) !== -1) {

    }
    this.isPaused = !this.isPaused;
  }
}
