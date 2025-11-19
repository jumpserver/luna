import {Component, Input, OnInit} from '@angular/core';
import {Command, Replay} from '@app/model';
import {HttpService} from '@app/services';
import {TranslateService} from '@ngx-translate/core';
import {formatTime} from '@app/utils/common';

@Component({
  standalone: false,
  selector: 'elements-replay-mp4',
  templateUrl: 'mp4.component.html',
  styleUrls: ['mp4.component.scss']
})
export class ElementsReplayMp4Component implements OnInit {
  @Input() replay: Replay;
  @Input() type: string | undefined;

  startTime = null;
  startTimeStamp = null;
  commands: Command[];
  page = 0;
  height = 0;
  width = 0;

  constructor(private _http: HttpService, private _translate: TranslateService) {
  }

  ngOnInit() {
    this.commands = new Array<Command>();
    const date = new Date(Date.parse(this.replay.date_start));
    this.startTime = this.toSafeLocalDateStr(date);
    this.startTimeStamp = Date.parse(this.replay.date_start);
    this.getCommands(this.page);
    this.height = window.innerHeight - 100;
    this.width = window.innerWidth - 100;
  }

  toSafeLocalDateStr(d) {
    const date_s = d.toLocaleString(this.getUserLang(), {hour12: false});
    return date_s.split('/').join('-');
  }

  getUserLang() {
    const userLangEN = document.cookie.indexOf('django_language=en');
    if (userLangEN === -1) {
      return 'zh-CN';
    } else {
      return 'en-US';
    }
  }

  getCommands(page: number) {
    if (!this.startTimeStamp) {
      return;
    }
    this._http.getCommandsData(this.replay.id, page)
      .subscribe(
        data => {
          const results = data.results;
          results.forEach(element => {
            element.atime = formatTime(element.timestamp * 1000 - this.startTimeStamp);
          });
          this.commands = this.commands.concat(results);
        },
        err => {
          alert('没找到命令记录');
        }
      );
  }

  onScroll() {
    this.getCommands(++this.page);
  }

  commandClick(item: Command) {

  }

}
