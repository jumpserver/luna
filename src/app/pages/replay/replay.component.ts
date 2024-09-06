import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {HttpService, I18nService, LogService, SettingService} from '@app/services';
import {Replay, User} from '@app/model';

@Component({
  selector: 'pages-replay',
  templateUrl: './replay.component.html',
  styleUrls: ['./replay.component.css']
})
export class PagesReplayComponent implements OnInit {
  replay: Replay = new Replay();
  user: User;

  constructor(private route: ActivatedRoute,
              private _http: HttpService,
              private _settingSvc: SettingService,
              private _i18n: I18nService,
              private _logger: LogService) {
    this.getCurrentUser();
  }

  getCurrentUser() {
    this._http.getUserProfile().subscribe(user => {
      this.user = user;
    });
  }

  ngOnInit() {
    let sid = '';
    this.route.params.subscribe(params => {
      sid = params['sid'];
    });
    const interval = setInterval(() => {
      this._http.getReplay(sid).subscribe(
        data => {
          if (data['error']) {
            alert('没找到录像文件');
            clearInterval(interval);
            return;
          }
          if (data['type']) {
            Object.assign(this.replay, data);
            this.replay.id = sid;
            clearInterval(interval);
            const auditorUser =  `${this._i18n.instant('Viewer')}: ${this.user.name}(${this.user.username})`;
            const sessionContent = `${this._i18n.instant('Operator')}: ${this.replay.user}\n${this.replay.asset}`;
            const content = `${auditorUser}\n${sessionContent}`;
            this._settingSvc.createWaterMarkIfNeed(
              document.body, `${content}`
            );
          }
        },
        err => {
          alert('没找到录像文件');
          clearInterval(interval);
        }
      );
    }, 2000);
  }

  isLoad() {
    const tp = this.replay.type;
    const supportedType = {
      'json': true,
      'guacamole': true,
      'asciicast': true,
      'mp4': true,
      'parts': true};
    return !supportedType[tp];
  }
}
