import { filter } from 'rxjs';
import { HttpService } from '@app/services';
import { Command, Replay } from '@app/model';
import { formatTime } from '@app/utils/common';
import { ActivatedRoute } from '@angular/router';
import { AfterViewInit, Component, HostListener, Input, OnInit } from '@angular/core';

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
  timer: any;
  startTime = null;
  startTimeStamp = null;
  commands: Command[];
  page = 0;
  private AsciinemaPlayer: any;
  private playerCreated = false;

  constructor(
    private route: ActivatedRoute,
    private _http: HttpService
  ) {
    this.startAt = 0;
  }

  async ngOnInit() {
    await this.loadAsciinemaPlayer();

    this.commands = new Array<Command>();

    const start = new Date(this.replay.date_start);
    const end = new Date(this.replay.date_end);
    const duration = end.getTime() - start.getTime();
    const date = new Date(Date.parse(this.replay.date_start));
    this.startTimeStamp = Date.parse(this.replay.date_start);
    this.startTime = this.toSafeLocalDateStr(date);
    this.route.queryParams.pipe(filter(params => params.timestamp)).subscribe(params => {
      // 从指定的时间戳开始播放，减去 5 秒误差提前开始
      this.startAt = parseInt(params.timestamp, 10) - 5;
      if (this.startAt <= 0) {
        this.startAt = 0;
      }
      // duration 应该是毫秒，需要转换为秒进行比较
      const durationInSeconds = duration / 1000;
      if (this.startAt >= durationInSeconds) {
        this.startAt = durationInSeconds;
      }
    });
    this.rows = Math.min(25, Math.floor((window.innerHeight - 120) / 16)); // 限制最大25行，调整计算方式
    this.position = '00:00';
    this.duration = formatTime(duration);
    this.getCommands(this.page);

    this.createPlayerWhenReady();
  }

  private async loadAsciinemaPlayer() {
    try {
      const module = await import('asciinema-player');

      this.AsciinemaPlayer = module.default || module;
    } catch (error) {
      console.error('Failed to load asciinema-player:', error);

      this.AsciinemaPlayer = (window as any).AsciinemaPlayer;
    }
  }

  ngAfterViewInit() {
    this.createPlayerWhenReady();
  }

  private createPlayerWhenReady() {
    if (this.playerCreated) {
      return;
    }

    if (this.AsciinemaPlayer) {
      this.player = this.createPlayer();

      if (this.player) {
        this.player.play();
        this.isPlaying = true;
        this.createTimer();
        this.playerCreated = true;
      } else {
        console.error('Player creation failed');
      }
    } else {
      setTimeout(() => this.createPlayerWhenReady(), 100);
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    this.rows = Math.min(25, Math.floor((window.innerHeight - 120) / 16));
    this.resetPlayerWithCurrentTime();
  }

  speedDown() {
    if (this.speed <= 1) {
      return;
    }
    this.speed--;
    this.resetPlayerWithCurrentTime();
  }

  speedUp() {
    this.speed++;
    this.resetPlayerWithCurrentTime();
  }

  toggle() {
    if (!this.player) return;

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
    if (!this.player || !this.AsciinemaPlayer) {
      return;
    }
    this.player.pause();
    this.player.dispose();
    this.player = this.createPlayer();
  }

  /**
   * 重置播放器并保持当前播放位置和状态
   */
  private resetPlayerWithCurrentTime() {
    if (!this.player) return;

    this.currentTime = this.player.getCurrentTime();

    if (isNaN(this.currentTime) || this.currentTime < 0) {
      this.currentTime = 0;
    }

    this.startAt = this.currentTime;
    const wasPlaying = this.isPlaying;
    this.isPlaying = false;

    this.resetPlayer();

    if (this.player) {
      setTimeout(() => {
        if (this.player) {
          this.player.seek(this.currentTime);
          if (wasPlaying) {
            this.player.play();
            this.isPlaying = true;
          }
        }
      }, 100);
    }
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
    if (!this.AsciinemaPlayer) {
      console.error('AsciinemaPlayer not loaded');
      return null;
    }

    const el = document.getElementById('screen');

    if (!el) {
      console.error('Screen element not found');
      return null;
    }

    if (!this.replay?.src) {
      console.error('Replay src not available');
      return null;
    }

    const opt = this.getPlayerOptions();

    try {
      const player = this.AsciinemaPlayer.create(this.replay.src, el, opt);
      return player;
    } catch (error) {
      console.error('Error creating player:', error);
      return null;
    }
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
        console.error('getCommandsData error:', err);
        alert('没找到命令记录');
      }
    );
  }

  onScroll() {
    this.getCommands(++this.page);
  }

  commandClick(item: Command) {
    if (!this.player) return;

    const startPlayTime = new Date(this.replay.date_start).getTime() / 1000;
    const instructStartTime = item.timestamp - 5 - startPlayTime;
    const time = instructStartTime > 0 ? instructStartTime : 0;
    this.player.seek(time);
  }
}
