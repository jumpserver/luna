import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {AppService, HttpService, I18nService, SettingService} from '@app/services';
import {ActivatedRoute} from '@angular/router';
import {Session, Ticket} from '@app/model';
import {ToastrService} from 'ngx-toastr';

@Component({
  selector: 'pages-monitor',
  templateUrl: './monitor.component.html',
  styleUrls: ['./monitor.component.scss']
})
export class PagesMonitorComponent implements OnInit {
  @ViewChild('contentWindow', {static: false}) windowRef: ElementRef;
  iframeURL: string;
  sessionDetail: Session = null;
  sessionID: string;
  isPaused : boolean = false;
  ticketID: string;
  ticketDetail: Ticket;
  supportedLock: boolean = false;

  constructor(private _appService: AppService,
              private _settingSvc: SettingService,
              private _http: HttpService,
              private _route: ActivatedRoute,
              private _toastr: ToastrService,
              private _i18n: I18nService,) {
  }

  ngOnInit() {
    this._route.params.subscribe(params => {
      this.sessionID = params['sid'];
      this.generateMonitorURL().then(() => {
        this._settingSvc.createWaterMarkIfNeed(
          this.windowRef.nativeElement,
          `${this.sessionDetail.user}\n${this.sessionDetail.asset}`
        );
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
    const supportedType = ['koko', 'lion', 'magnus', 'chen', 'kael'];
    this.supportedLock = supportedType.includes(this.sessionDetail.terminal.type);
    const protocol = window.location.protocol.replace(':', '');
    const data = { 'assetId': '', 'appId': '', 'sessionId': this.sessionID, 'token': ''};
    const smartEndpoint = await this._http.getSmartEndpoint(data, protocol);
    const baseUrl = smartEndpoint.getUrl();
    if (this.sessionDetail.terminal.type === 'lion') {
      this.iframeURL = `${baseUrl}/lion/monitor/?session=${this.sessionID}`;
    } else {
      this.iframeURL = `${baseUrl}/koko/monitor/${this.sessionID}/`;
    }
  }

  togglePause($event) {
    if (!this.sessionDetail) {
      return
    }
    if (this.sessionDetail.is_finished) {
      return;
    }
    if (this.ticketID && !this.ticketDetail) {
      this._http.toggleLockSessionForTicket(this.ticketID, this.sessionID, !this.isPaused
      ).then((res) => {
        this.handleToggleResponse(res).then()
      });
    }else {
      this._http.toggleLockSession(this.sessionID, !this.isPaused).then((res) => {
       this.handleToggleResponse(res).then()
      });
    }
  }

  async handleToggleResponse(res) {
    const pauseTaskMsg = await this._i18n.t('Pause task has been send');
    const resumeTaskMsg = await this._i18n.t('Resume task has been send');
    const session_ids = res['ok'];
    const msg = this.isPaused ?  resumeTaskMsg:pauseTaskMsg;
    this._toastr.success(msg)
    if (session_ids.indexOf(this.sessionID) !== -1) {

    }
    this.isPaused = !this.isPaused;
  }
}
