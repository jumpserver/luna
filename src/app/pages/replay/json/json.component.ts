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
  speed = 1;
  setPercent = 0;
  toggle = false;
  TICK = 33;
  TIMESTEMP = 33;
  time = 1;
  timer: any;
  pos = 0;
  scrubber: number;
  term: Terminal;

  @Input() replay: Replay;

  constructor(private _http: HttpService) {}

  ngOnInit() {
    this.term = new Terminal();
    if (this.replay.src !== 'READY') {
      console.log('SRC', this.replay.src);
      this._http.get_replay_data(this.replay.src)
        .subscribe(
          data => {
            this.replay.json = data;
            this.replay.timelist = Object.keys(this.replay.json).map(Number);
            this.replay.timelist = this.replay.timelist.sort((a, b) => {
              return a - b;
            });
            this.replay.totalTime = this.replay.timelist[this.replay.timelist.length - 1] * 1000;
          },
          err => {
            alert('无法下载');
            console.log(err);
          }
        );
    }

    const that = this;
    let r = true;
    window.addEventListener('resize', () => {
      if (r) {
        that.pause();
        r = false;
      }
    });
  }

  setSpeed() {
    if (this.speed === 0) {
      this.TIMESTEMP = this.TICK;
    } else if (this.speed < 0) {
      this.TIMESTEMP = this.TICK / -this.speed;
    } else {
      this.TIMESTEMP = this.TICK * this.speed;
    }
  }

  restart() {
    clearInterval(this.timer);
    this.term.reset();
    this.time = 1;
    this.pos = 0;
    this.toggle = true;
    this.timer = setInterval(() => {
      this.advance(this);
    }, this.TICK);
  }

  pause() {
    if (this.toggle) {
      clearInterval(this.timer);
      this.toggle = !this.toggle;
    } else {
      this.timer = setInterval(() => {
        this.advance(this);
      }, this.TICK);
      this.toggle = !this.toggle;
    }
  }

  advance(that) {
    that.scrubber = Math.ceil((that.time / this.replay.totalTime) * 100);
    // document.getElementById('beforeScrubberText').innerHTML = this.buildTimeString(this.time);
    for (; that.pos < this.replay.timelist.length; that.pos++) {
      if (this.replay.timelist[that.pos] * 1000 <= that.time) {
        this.term.write(this.replay.json[this.replay.timelist[that.pos].toString()]);
      } else {
        break;
      }
    }

    if (that.pos >= this.replay.timelist.length) {
      this.toggle = !this.toggle;
      clearInterval(that.timer);
    }
    if (this.replay.timelist[that.pos] - this.replay.timelist[that.pos - 1] > 5) {
      that.time += 5000;
    }

    that.time += that.TIMESTEMP;
    that.setPercent = that.time / this.replay.totalTime * 100;
  }

  stop() {
    clearInterval(this.timer);
    this.toggle = false;
  }

  rununil() {
    this.pos = 0;
    this.term.reset();
    this.toggle = false;
    for (; this.pos < this.replay.timelist.length; this.pos++) {
      if (this.replay.timelist[this.pos] * 1000 <= this.setPercent / 100 * this.replay.totalTime) {
        this.term.term.write(this.replay.json[this.replay.timelist[this.pos].toString()]);
      } else {
        break;
      }
    }
    this.time = this.replay.totalTime * this.setPercent / 100;
  }

}
