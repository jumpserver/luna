import {Component, Input, OnInit} from '@angular/core';
import {Replay} from '@app/model';
import {HttpService} from '@app/services';
import {TranslateService} from '@ngx-translate/core';
import * as Guacamole from 'guacamole-common-js/dist/guacamole-common';

@Component({
  selector: 'elements-replay-parts',
  templateUrl: './parts.component.html',
  styleUrls: ['./parts.component.scss']
})
export class ElementsPartsComponent implements OnInit {
  @Input() replay: Replay;

  replayData: any;
  replayType: string;
  startTime = null;
  files = [];

  constructor(private _http: HttpService, private _translate: TranslateService) { }

  ngOnInit() {
    this._http.getReplayData(this.replay.src)
      .subscribe(
        data => {
          this.replayData = data;
          this.replayType = data.type;
          this.startTime = this.toSafeLocalDateStr(new Date(Date.parse(data.date_start)));
          this.files = data.files;
          console.log(this.files);
        },
        err => {
          alert('无法下载');
        }
      );
  }
  getUserLang() {
    const userLangEN = document.cookie.indexOf('django_language=en');
    if (userLangEN === -1) {
      return 'zh-CN';
    } else {
      return 'en-US';
    }
  }
  toSafeLocalDateStr(d) {
    const date_s = d.toLocaleString(this.getUserLang(), {hour12: false});
    return date_s.split('/').join('-');
  }
  getPartFileData(filename: string) {
    // 返回的数据类似 Replay 格式
    return this._http.getPartFileReplay(this.replay.src, filename);
  }

}
