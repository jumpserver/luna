import {Component, Input, OnInit} from '@angular/core';
import * as Terminal from 'xterm/dist/xterm';
import {HttpService, LogService} from '../../../app.service';
import {Replay} from '../replay.model';

@Component({
  selector: 'app-replay-json',
  templateUrl: './json.component.html',
  styleUrls: ['./json.component.css']
})
export class JsonComponent implements OnInit {
  speed = 2;
  percent = 0;
  play = false;
  tick = 33;
  timeStep = 33;
  time = 1;
  timer: any; // 多长时间播放下一个
  pos = 0; // 播放点
  scrubber: number;
  term: Terminal;

  @Input() replay: Replay;

  constructor(private _http: HttpService) {}

  ngOnInit() {
    this.term = new Terminal();
    if (this.replay.src !== 'READY') {
      this._http.get_replay_data(this.replay.src)
        .subscribe(
          data => {
            this.replay.json = data;
            this.replay.timelist = Object.keys(this.replay.json).map(Number);
            this.replay.timelist = this.replay.timelist.sort((a, b) => {
              return a - b;
            });
            this.replay.totalTime = this.replay.timelist[this.replay.timelist.length - 1] * 1000;
            this.toggle();
          },
          err => {
            alert('无法下载');
            console.log(err);
          }
        );
    }
  }

  restart() {
    clearInterval(this.timer);
    this.term.reset();
    this.time = 1;
    this.pos = 0;
    this.play = true;
    this.timer = setInterval(() => {
      this.advance();
    }, this.tick);
  }

  toggle() {
    if (this.play) {
      clearInterval(this.timer);
      this.play = !this.play;
    } else {
      this.timer = setInterval(() => {
        this.advance();
      }, this.tick);
      this.play = !this.play;
    }
  }

  advance() {
    // 每个time间隔执行一次
    // this.scrubber = Math.ceil((this.time / this.replay.totalTime) * 100);
    for (; this.pos < this.replay.timelist.length; this.pos++) {
      if (this.replay.timelist[this.pos] * 1000 <= this.time) {
        this.term.write(this.replay.json[this.replay.timelist[this.pos].toString()]);
      } else {
        break;
      }
    }

    // 超过了总的时间点, 停止播放
    if (this.pos >= this.replay.timelist.length) {
      this.play = !this.play;
      clearInterval(this.timer);
    }

    // 如果两次时间间隔超过了5s
    if (this.replay.timelist[this.pos] - this.replay.timelist[this.pos - 1] > 5) {
      this.time += 5000;
    }

    this.time += this.timeStep * this.speed;
    this.percent = this.time / this.replay.totalTime * 100;
  }

  stop() {
    clearInterval(this.timer);
    this.play = false;
  }

  speedUp() {
    this.speed += 1;
  }

  speedDown() {
    this.speed -= 1;
  }

  runFrom() {
    clearInterval(this.timer);
    const time = this.replay.totalTime * this.percent / 100;
    this.replay.timelist.forEach((v, i) => {
      const preTime = this.replay.timelist[i - 1];
      if (time <= v * 1000 && time >= preTime * 1000) {
        this.time = v * 1000;
        this.pos = i;
        return;
      }
    });
    this.timer = setInterval(() => {
      this.advance();
    }, this.tick);
    this.play = !this.play;
  }
    // this.pos = 0;
    // this.term.reset();
    // this.play = false;
    // for (; this.pos < this.replay.timelist.length; this.pos++) {
    //   if (this.replay.timelist[this.pos] * 1000 <= this.percent / 100 * this.replay.totalTime) {
    //     this.term.term.write(this.replay.json[this.replay.timelist[this.pos].toString()]);
    //   } else {
    //     break;
    //   }
    // }
    // this.time = this.replay.totalTime * this.percent / 100;
  // }
}
