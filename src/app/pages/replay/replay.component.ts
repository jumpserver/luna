import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {HttpService, LogService, SettingService} from '@app/services';
import {Replay} from '@app/model';
import {canvasWaterMark} from '@app/utils/common';

@Component({
  selector: 'pages-replay',
  templateUrl: './replay.component.html',
  styleUrls: ['./replay.component.css']
})
export class PagesReplayComponent implements OnInit {
  replay: Replay = new Replay();

  constructor(private route: ActivatedRoute,
              private _http: HttpService,
              private _settingSvc: SettingService,
              private _logger: LogService) {
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
            clearInterval(interval);
            this.createWaterMarkIfNeed();
          }
        },
        err => {
          alert('没找到录像文件');
          clearInterval(interval);
        }
      );
    }, 2000);
  }

  createWaterMarkIfNeed() {
    if (this._settingSvc.globalSetting.SECURITY_WATERMARK_ENABLED) {
      canvasWaterMark({
        container: document.body,
        content: `${this.replay.user}`,
      });
    }
  }
}
