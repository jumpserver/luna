import {Component, OnInit} from '@angular/core';
import {Video} from '../../globals';

declare let jQuery: any;
declare let Terminal: any;

@Component({
  selector: 'app-json',
  templateUrl: './json.component.html',
  styleUrls: ['./json.component.css']
})
export class JsonComponent implements OnInit {
  term: any;
  speed = 1;
  setPercent = 0;
  toggle = false;
  TICK = 33;
  TIMESTEP = 33;
  time = 1;
  timer: any;
  pos = 0;
  scrubber: number;

  constructor() {
  }

  ngOnInit() {
    let col = Math.floor(jQuery('#term').width() / jQuery('#liuzheng').width() * 8) - 3;
    let row = Math.floor(jQuery('#term').height() / jQuery('#liuzheng').height()) - 5;
    this.term = new Terminal({
      cols: col,
      rows: row,
      useStyle: true,
      screenKeys: true,
    });
    this.term.open(document.getElementById('term'), true);
    const that = this;
    window.onresize = function () {
      let col = Math.floor(jQuery('#term').width() / jQuery('#liuzheng').width() * 8) - 3;
      let row = Math.floor(jQuery('#term').height() / jQuery('#liuzheng').height()) - 5;

      if (col < 80) {
        col = 80;
      }
      if (row < 24) {
        row = 24;
      }
      that.term.resize(col, row);
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

  start() {
    console.log(Video.timelist);
  }

  restart() {
    clearInterval(this.timer);
    this.term.reset();
    this.time = (this.setPercent / 100) * Video.totalTime;
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
    that.scrubber = Math.ceil((that.time / Video.totalTime) * 100);
    // document.getElementById('beforeScrubberText').innerHTML = this.buildTimeString(this.time);
    for (; that.pos < Video.timelist.length; that.pos++) {
      if (Video.timelist[that.pos] * 1000 <= that.time) {
        this.term.write(Video.json[Video.timelist[that.pos].toString()]);
      } else {
        break;
      }
    }

    if (that.pos >= Video.timelist.length) {
      this.toggle = !this.toggle;
      clearInterval(that.timer);
    }

    that.time += that.TIMESTEP;
    that.setPercent = that.time / Video.totalTime * 100;
  }

  stop() {
    clearInterval(this.timer);
    this.toggle = false;
  }

  rununil() {
    this.pos = 0;
    this.term.reset();
    this.toggle = false;
    for (; this.pos < Video.timelist.length; this.pos++) {
      if (Video.timelist[this.pos] * 1000 <= this.setPercent / 100 * Video.totalTime) {
        this.term.write(Video.json[Video.timelist[this.pos].toString()]);
      } else {
        break;
      }
    }
    this.time = Video.timelist[this.pos];
  }

}
