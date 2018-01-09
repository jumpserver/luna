import {AfterViewInit, Component, OnInit} from '@angular/core';
import {Video} from '../../globals';
import {term} from '../../globals';

import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'app-json',
  templateUrl: './json.component.html',
  styleUrls: ['./json.component.css']
})
export class JsonComponent implements OnInit, AfterViewInit {
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
    this.restart();
  }

  ngAfterViewInit() {
    this.restart();
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
    that.scrubber = Math.ceil((that.time / Video.totalTime) * 100);
    // document.getElementById('beforeScrubberText').innerHTML = this.buildTimeString(this.time);
    for (; that.pos < Video.timelist.length; that.pos++) {
      if (Video.timelist[that.pos] * 1000 <= that.time) {
        term.term.write(Video.json[Video.timelist[that.pos].toString()]);
      } else {
        break;
      }
    }

    if (that.pos >= Video.timelist.length) {
      this.toggle = !this.toggle;
      clearInterval(that.timer);
    }
    if (Video.timelist[that.pos] - Video.timelist[that.pos - 1] > 5) {
      that.time += 5000;
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
    term.term.reset();
    this.toggle = false;
    for (; this.pos < Video.timelist.length; this.pos++) {
      if (Video.timelist[this.pos] * 1000 <= this.setPercent / 100 * Video.totalTime) {
        term.term.write(Video.json[Video.timelist[this.pos].toString()]);
      } else {
        break;
      }
    }
    this.time = Video.totalTime * this.setPercent / 100;
  }

}
