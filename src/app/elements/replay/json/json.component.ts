import {Component, Input, OnInit, OnChanges} from '@angular/core';
import {Terminal} from 'xterm';
import {HttpService} from '@app/services';
import {Replay} from '@app/model';
import {newTerminal} from '@app/utils/common';
import {formatTime} from '@app/utils/common';


@Component({
  selector: 'elements-replay-json',
  templateUrl: './json.component.html',
  styleUrls: ['./json.component.css']
})
export class ElementReplayJsonComponent implements OnInit {
  isPlaying = false;
  recording: any;
  playerRef: any;
  displayRef: any;
  max = 0;
  time = 0;
  duration = '00:00';
  timeList = [];
  replayData = {};
  speed = 2;
  tick = 33; // 每33s滴答一次
  timeStep = 33; // 步长
  timer: any; // 多长时间播放下一个
  pos = 0; // 播放点
  term: Terminal;
  termCols = 80;
  termRows = 24;
  startTime = null;

  get position() {
    return formatTime(this.time);
  }
  set position(data) {
  }
  @Input() replay: Replay;

  constructor(private _http: HttpService) {}

  ngOnInit() {
    this.term = newTerminal(14);
    const date = new Date(Date.parse(this.replay.date_start));
    this.startTime = this.toSafeLocalDateStr(date);
    if (this.replay.src !== 'READY') {
      this._http.getReplayData(this.replay.src)
        .subscribe(
          data => {
            this.replayData = data;
            this.timeList = Object.keys(this.replayData);
            this.timeList = this.timeList.sort((a, b) => {
              return a - b;
            });
            this.max = this.timeList[this.timeList.length - 1] * 1000;
            this.duration = formatTime(this.max);
            this.toggle();
          },
          err => {
            alert('无法下载');
          }
        );
    }
  }

  restart() {
    clearInterval(this.timer);
    this.term.reset();
    this.pos = 0;
    this.time = 0;
    this.isPlaying = true;
    this.timer = setInterval(() => {
      this.advance();
    }, this.tick);
  }

  toggle() {
    if (this.isPlaying) {
      clearInterval(this.timer);
      this.isPlaying = !this.isPlaying;
    } else {
      this.timer = setInterval(() => {
        this.advance();
      }, this.tick);
      this.isPlaying = !this.isPlaying;
    }
  }

  advance() {
    // 每个time间隔执行一次
    // for (let i in this.timeList) {
    // }
    for (; this.pos < this.timeList.length; this.pos++) {
      if (this.timeList[this.pos] * 1000 <= this.time) {
        this.term.write(this.replayData[this.timeList[this.pos]]);
      } else {
        break;
      }
    }

    // 超过了总的时间点, 停止播放
    if (this.pos >= this.timeList.length) {
      this.isPlaying = !this.isPlaying;
      clearInterval(this.timer);
    }
    this.time += this.timeStep * this.speed;
  }

  stop() {
    clearInterval(this.timer);
    this.isPlaying = false;
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
  speedUp() {
    this.speed += 1;
  }

  speedDown() {
    this.speed -= 1;
  }

  runFrom() {
    for (let i = 0; i < this.timeList.length; i++) {
      const v = this.timeList[i];
      const preTime = this.timeList[i - 1];
      if (this.time <= v * 1000 && this.time >= preTime * 1000) {
        this.time = v * 1000;
        this.pos = i;
        break;
      }
    }
    this.advance();
  }

  resizeTerm() {
    this.term.resize(this.termCols, this.termRows);
    this.restart();
  }

  onTermSizeChange(evt) {
    setTimeout(() => {
      this.termCols = evt[0];
      this.termRows = evt[1];
    }, 500);
  }
}
