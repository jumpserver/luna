import {Component, OnInit} from '@angular/core';
import {AppService, HttpService} from '@app/services';
import {ActivatedRoute} from '@angular/router';
import {Session} from '@app/model';

@Component({
  selector: 'pages-monitor',
  templateUrl: './monitor.component.html',
  styleUrls: ['./monitor.component.scss']
})
export class PagesMonitorComponent implements OnInit {
  iframeURL: string;
  sessionDetail: Session;
  sessionID: string;

  constructor(private _appService: AppService,
              private _http: HttpService,
              private _route: ActivatedRoute) {
  }

  ngOnInit() {
    this._route.params.subscribe(params => {
      this.sessionID = params['sid'];
      this.generateMonitorURL().then();
    });
  }

  async generateMonitorURL() {
    this.sessionDetail = await this._http.getSessionDetail(this.sessionID);
    if (['rdp', 'vnc'].indexOf(this.sessionDetail.protocol) > -1) {
      this.iframeURL = `${document.location.origin}/lion/monitor/?session=${this.sessionID}`;
    } else {
      this.iframeURL = `${document.location.origin}/koko/terminal/?target_id=${this.sessionID}&type=shareroom`;
    }
  }
}
