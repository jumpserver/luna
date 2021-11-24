import {Component, OnInit, Input} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import 'rxjs/add/operator/filter';
import {Replay} from '@app/model';
import {formatTime} from '@app/utils/common';

declare var asciinema: any;

@Component({
  selector: 'elements-replay-asciicast',
  templateUrl: './asciicast.component.html',
  styleUrls: ['./asciicast.component.scss']
})
export class ElementReplayAsciicastComponent implements OnInit {

  @Input() replay: Replay;
  player: any;
  isPlaying: boolean = false;
  currentTime: number = 0;
  speed: number = 2;
  startAt: number = 0;
  cols: number;
  rows: number;
  duration: string;
  position: string;
  timer: any; // 多长时间播放下一个

  constructor(private route: ActivatedRoute) {
    this.startAt = 0;
  }

  ngOnInit() {
    const start = new Date(this.replay.date_start);
    const end = new Date(this.replay.date_end);
    const duration = end.getTime() - start.getTime();
    this.route.queryParams.filter(params => params.timestamp).subscribe(params => {
        // 计算开始时间时，减去 5 秒误差
        this.startAt = (end.getTime() / 1000) - parseInt(params.timestamp, 10) - 5;
        if (this.startAt <= 0) {
          this.startAt = 0;
        }
        if (this.startAt >= duration) {
          this.startAt = duration;
        }
      }
    );
    this.cols = window.innerWidth;
    this.rows = window.innerHeight - 50;
    this.position = '00:00';
    this.duration = formatTime(duration);
    this.player = this.createPlayer();
    this.isPlaying = true;
    this.player.play();
    this.createTimer();
  }

  speedDown() {
    this.speed--;
    if (this.speed <= 0) {
      this.speed = 1;
    }
    this.currentTime = this.player.getCurrentTime();
    this.resetPlayer();
    this.player.setCurrentTime(this.currentTime);
    this.isPlaying = true;
    this.player.play();
    this.createTimer();
  }

  speedUp() {
    this.speed++;
    this.currentTime = this.player.getCurrentTime();
    this.resetPlayer();
    this.player.setCurrentTime(this.currentTime);
    this.isPlaying = true;
    this.player.play();
    this.createTimer();
  }

  toggle() {
    clearInterval(this.timer);
    if (this.isPlaying) {
      this.player.pause();
    } else {
      this.player.play();
      this.createTimer();
    }

    this.isPlaying = !this.isPlaying;
  }

  createTimer() {
    this.timer = setInterval(() => {
      const currentTime = this.player.getCurrentTime();
      const currentPosition = formatTime(currentTime * 1000);
      if (this.position === currentPosition && this.position !== '00:00') {
        clearInterval(this.timer);
        this.isPlaying = false;
      }
      this.position = currentPosition;
    }, 500);
  }

  restart() {
    this.startAt = 0;
    this.speed = 2;
    this.isPlaying = true;
    this.resetPlayer();
  }

  resetPlayer() {
    clearInterval(this.timer);
    if (this.player) {
      this.player.pause();
    }
    const el = document.getElementById('player');
    asciinema.player.js.UnmountPlayer(el);
    this.player = this.createPlayer();
  }

  getPlayerOptions() {
    return {
      width: this.cols,
      startAt: this.startAt,
      speed: this.speed,
      preload: true,
      autoPlay: this.isPlaying ? 1 : 0,
    };
  }

  createPlayer() {
    const el = document.getElementById('player');
    const opt = this.getPlayerOptions();
    return asciinema.player.js.CreatePlayer(el, this.replay.src, opt);
  }

  resizeWindow() {

  }
}
