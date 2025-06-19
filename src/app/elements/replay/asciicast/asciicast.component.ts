import { AfterViewInit, Component, HostListener, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Command, Replay } from '@app/model';
import { formatTime } from '@app/utils/common';
import { HttpService } from '@app/services';
import { filter } from 'rxjs';

declare const AsciinemaPlayer: any;

@Component({
  standalone: false,
  selector: 'elements-replay-asciicast',
  templateUrl: 'asciicast.component.html',
  styleUrls: ['asciicast.component.scss']
})
export class ElementReplayAsciicastComponent implements OnInit, AfterViewInit {
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
  startTime = null;
  startTimeStamp = null;
  commands: Command[];
  page = 0;

  constructor(
    private route: ActivatedRoute,
    private _http: HttpService
  ) {
    this.startAt = 0;
  }

  ngOnInit() {
    this.commands = new Array<Command>();
    const start = new Date(this.replay.date_start);
    const end = new Date(this.replay.date_end);
    const duration = end.getTime() - start.getTime();
    const date = new Date(Date.parse(this.replay.date_start));
    this.startTimeStamp = Date.parse(this.replay.date_start);
    this.startTime = this.toSafeLocalDateStr(date);
    this.route.queryParams.pipe(filter(params => params.timestamp)).subscribe(params => {
      // 计算开始时间时，减去 5 秒误差
      this.startAt = end.getTime() / 1000 - parseInt(params.timestamp, 10) - 5;
      if (this.startAt <= 0) {
        this.startAt = 0;
      }
      if (this.startAt >= duration) {
        this.startAt = duration;
      }
      /*  */
    });
    this.rows = Math.min(25, Math.floor((window.innerHeight - 120) / 16)); // 限制最大25行，调整计算方式
    this.position = '00:00';
    this.duration = formatTime(duration);
    this.getCommands(this.page);
  }

  ngAfterViewInit() {
    this.player = this.createPlayer();
    this.player.play();
    this.isPlaying = true;
    this.createTimer();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    this.rows = Math.min(25, Math.floor((window.innerHeight - 120) / 16));
    this.currentTime = this.player.getCurrentTime();
    this.resetPlayer();
  }

  speedDown() {
    if (this.speed <= 1) {
      return;
    }
    this.speed--;
    this.currentTime = this.player.getCurrentTime();
    this.resetPlayer();
    this.player.seek(this.currentTime);
  }

  speedUp() {
    this.speed++;
    this.currentTime = this.player.getCurrentTime();
    this.resetPlayer();
    this.player.seek(this.currentTime);
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
    // this.timer = setInterval(() => {
    //   const currentTime = this.player.getCurrentTime();
    //   const currentPosition = formatTime(currentTime * 1000);
    //   if (this.position === currentPosition && this.position !== '00:00') {
    //     clearInterval(this.timer);
    //     this.isPlaying = false;
    //   }
    //   this.position = currentPosition;
    // }, 500);
  }

  restart() {
    this.startAt = 0;
    this.speed = 2;
    this.isPlaying = true;
    this.resetPlayer();
  }

  resetPlayer() {
    clearInterval(this.timer);
    if (!this.player) {
      return;
    }
    this.player.pause();
    this.player.dispose();
    this.player = this.createPlayer();
  }

  getPlayerOptions() {
    return {
      startAt: this.startAt,
      speed: this.speed,
      preload: true,
      autoPlay: this.isPlaying ? 1 : 0,
      rows: this.rows,
      cols: 100,
      fit: false,
      terminalFontSize: '12px'
    };
  }

  createPlayer() {
    const el = document.getElementById('screen');
    const opt = this.getPlayerOptions();
    return AsciinemaPlayer.create(this.replay.src, el, opt);
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
    const date_s = d.toLocaleString(this.getUserLang(), { hour12: false });
    return date_s.split('/').join('-');
  }

  getCommands(page: number) {
    if (!this.startTimeStamp) {
      return;
    }
    this._http.getCommandsData(this.replay.id, page).subscribe(
      data => {
        const results = data.results;
        const startPlayTime = new Date(this.replay.date_start).getTime();
        results.forEach(element => {
          element.atime = formatTime(element.timestamp * 1000 - startPlayTime);
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
    const startPlayTime = new Date(this.replay.date_start).getTime() / 1000;
    const instructStartTime = item.timestamp - 5 - startPlayTime;
    const time = instructStartTime > 0 ? instructStartTime : 0;
    this.player.seek(time);
  }
}
