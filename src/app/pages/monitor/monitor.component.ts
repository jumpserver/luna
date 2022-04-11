import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {AppService, HttpService, SettingService} from '@app/services';
import {ActivatedRoute} from '@angular/router';
import {Session} from '@app/model';

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

  constructor(private _appService: AppService,
              private _settingSvc: SettingService,
              private _http: HttpService,
              private _route: ActivatedRoute) {
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
  }

  async generateMonitorURL() {
    this.sessionDetail = await this._http.getSessionDetail(this.sessionID);
    const protocol = window.location.protocol.replace(':', '');
    const data = { 'assetId': '', 'appId': '', 'sessionId': this.sessionID, 'token': ''};
    const smartEndpoint = await this._http.getSmartEndpoint(data, protocol);
    const endpointUrl = smartEndpoint.smart_url;
    if (['rdp', 'vnc'].indexOf(this.sessionDetail.protocol) > -1) {
      this.iframeURL = `${endpointUrl}/lion/monitor/?session=${this.sessionID}`;
    } else {
      this.iframeURL = `${endpointUrl}/koko/monitor/${this.sessionID}/`;
    }
  }
}
