import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {HttpService, I18nService, LogService, SettingService} from '@app/services';
import {Replay, User, Session, Asset} from '@app/model';
import {getWaterMarkContent} from '@app/utils/common';

@Component({
  selector: 'pages-replay',
  templateUrl: './replay.component.html',
  styleUrls: ['./replay.component.css']
})
export class PagesReplayComponent implements OnInit {
  replay: Replay = new Replay();
  user: User;
  session: Session;
  asset: Asset;
  sessionUser: User;
  loading: boolean = true;

  constructor(private route: ActivatedRoute,
              private _http: HttpService,
              private _settingSvc: SettingService,
              private _i18n: I18nService,
              private _logger: LogService) {
    this.getCurrentUser();
  }

  getCurrentUser() {
    this._http.getUserProfile().then(user => {
      this.user = user;
    });
  }

  async ngOnInit() {
    let sid = '';
    this.route.params.subscribe(params => {
      sid = params['sid'];
    });
    this.session = await this._http.getSessionDetail(sid);
    this.asset = await this._http.getAssetDetail(this.session.asset_id).toPromise();
    this.sessionUser = await this._http.getUserDetail(this.session.user_id);
    const interval = setInterval(() => {
      this._http.getReplay(sid).subscribe(
        data => {
          if (data['error']) {
            alert('没找到录像文件');
            clearInterval(interval);
            this.loading = false;
            return;
          }
          if (data['type']) {
            Object.assign(this.replay, data);
            this.replay.id = sid;
            clearInterval(interval);
            this.loading = false;
            const auditorUser = `${this._i18n.instant('Viewer')}: ${this.user.name}(${this.user.username})`;
            const sessionContent = getWaterMarkContent(this.sessionUser, this.asset, this._settingSvc);
            const content = `${auditorUser}\n${sessionContent}`;
            this._settingSvc.createWaterMarkIfNeed(
              document.body, `${content}`
            );
          }
        },
        err => {
          alert('没找到录像文件');
          clearInterval(interval);
          this.loading = false;
        }
      );
    }, 2000);
  }

  isLoad() {
    if (!this.loading) {
      return false;
    }

    const tp = this.replay.type;
    const supportedType = {
      'json': true,
      'guacamole': true,
      'asciicast': true,
      'mp4': true,
      'parts': true
    };
    return !supportedType[tp];
  }
}
