import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {AppService, HttpService, I18nService, SettingService} from '@app/services';
import {ActivatedRoute} from '@angular/router';
import {Session, Ticket, User} from '@app/model';
import {NzNotificationService} from 'ng-zorro-antd/notification';
import {getWaterMarkContent} from '@app/utils/common';

@Component({
  selector: 'pages-terminal',
  templateUrl: './terminal.component.html',
  styleUrls: ['./terminal.component.scss']
})
export class PagesTerminalComponent implements OnInit {
  @ViewChild('terminal', { static: true }) terminal: ElementRef;
  isPaused = false;
  sessionID: string;

  constructor(private _settingSvc: SettingService,
              private _http: HttpService,
              private _route: ActivatedRoute,
              private _toastr: NzNotificationService,
              private _i18n: I18nService) {
    this.getCurrentUser();
  }

  ngOnInit() {
    // Initialize component
  }

  getCurrentUser() {
    // Get current user implementation
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