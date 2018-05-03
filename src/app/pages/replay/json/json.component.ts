import {Component, Input, OnInit} from '@angular/core';
import {term} from '../../../globals';
import {HttpService, LogService} from '../../../app.service';
import {Video} from '../replay.model';

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
  TIMESTEP = 33;
  time = 1;
  timer: any;
  pos = 0;
  scrubber: number;

  @Input() video: Video;

  constructor(private _http: HttpService,
              private _logger: LogService) {
  }

  ngOnInit() {
    if (this.video.src !== 'READY') {
      this._http.get_replay_data(this.video.src)
        .subscribe(
          data => {
            this.video.json = data;
            this.video.timelist = Object.keys(this.video.json).map(Number);
            this.video.timelist = this.video.timelist.sort(function (a, b) {
              return a - b;
            });
            this.video.totalTime = this.video.timelist[this.video.timelist.length - 1] * 1000;
          },
          err => {
            alert('无法下载');
            this._logger.error(err);
          }
        );
    }

    const that = this;
    let r = true;
    window.onresize = function () {
      if (r) {
        that.pause();
        r = false;
      }
    };
  }

  setSpeed() {
    if (this.speed === 0) {
      this.TIMESTEP = this.TICK;
    } else if (this.speed < 0) {
      this.TIMESTEP = this.TICK / -this.speed;
    } else {
      this.TIMESTEP = this.TICK * this.speed;
    }
  }

  restart() {
    clearInterval(this.timer);
    term.term.reset();
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
    that.scrubber = Math.ceil((that.time / this.video.totalTime) * 100);
    // document.getElementById('beforeScrubberText').innerHTML = this.buildTimeString(this.time);
    for (; that.pos < this.video.timelist.length; that.pos++) {
      if (this.video.timelist[that.pos] * 1000 <= that.time) {
        term.term.write(this.video.json[this.video.timelist[that.pos].toString()]);
      } else {
        break;
      }
    }

    if (that.pos >= this.video.timelist.length) {
      this.toggle = !this.toggle;
      clearInterval(that.timer);
    }
    if (this.video.timelist[that.pos] - this.video.timelist[that.pos - 1] > 5) {
      that.time += 5000;
    }

    that.time += that.TIMESTEP;
    that.setPercent = that.time / this.video.totalTime * 100;
  }

  stop() {
    clearInterval(this.timer);
    this.toggle = false;
  }

  rununil() {
    this.pos = 0;
    term.term.reset();
    this.toggle = false;
    for (; this.pos < this.video.timelist.length; this.pos++) {
      if (this.video.timelist[this.pos] * 1000 <= this.setPercent / 100 * this.video.totalTime) {
        term.term.write(this.video.json[this.video.timelist[this.pos].toString()]);
      } else {
        break;
      }
    }
    this.time = this.video.totalTime * this.setPercent / 100;
  }

}
