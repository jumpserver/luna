import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  ViewEncapsulation
} from '@angular/core';
import * as Guacamole from 'guacamole-common-js/dist/guacamole-common';
import { Command, Replay } from '@app/model';
import { HttpService } from '@app/services';
import { formatTime } from '@app/utils/common';
import { TranslateService } from '@ngx-translate/core';
import { fromEvent, Observable, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'elements-replay-guacamole',
  templateUrl: './guacamole.component.html',
  styleUrls: ['./guacamole.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class ElementReplayGuacamoleComponent implements OnInit, OnChanges {
  isPlaying = false;
  recording: any;
  playerRef: any;
  displayRef: any;
  screenRef: any;
  recordingDisplay: any;
  max = 100;
  percent = 0;
  duration = '00:00';
  position = '00:00';
  @Input() replay: Replay;
  startTime = null;
  startTimeStamp = null;
  commands: Command[] = [];
  page = 0;
  leftInfo = null;
  winSizeChange$: Observable<any>;
  winSizeSub: Subscription;
  firstLoad = true;
  rangeHideClass = 'hideCursor';
  lastDuration: number = 0;
  interval: number;
  initializedCommand: boolean = false;

  constructor(private _http: HttpService, private _translate: TranslateService) {}

  ngOnInit() {
    this.initialize();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['replay'] && changes['replay'].currentValue) {
      this.destroy();
      this.initialize();
    }
  }

  initialize() {
    if (!this.replay || !this.replay.src) {
      return alert('Not found replay');
    }

    this.commands = [];


    const date = new Date(Date.parse(this.replay.date_start));
    this.startTime = this.toSafeLocalDateStr(date);
    this.startTimeStamp = Date.parse(this.replay.date_start);
    this.playerRef = document.getElementById('player');
    this.displayRef = document.getElementById('display');
    this.screenRef = document.getElementById('screen');

    const tunnel = new Guacamole.StaticHTTPTunnel(this.replay.src);
    this.recording = new Guacamole.SessionRecording(tunnel);
    this.recordingDisplay = this.recording.getDisplay();
    const recordingElement = this.recordingDisplay.getElement();

    recordingElement.style.margin = '0 auto';

    this.screenRef.appendChild(recordingElement);

    this.initRecording();

    if (!this.initializedCommand) {
      this.getCommands(this.page);

      this.initializedCommand = true;
    }

    this._translate.get('LeftInfo').subscribe((res: string) => {
      this.leftInfo = res;
    });
    this.winSizeChange$ = fromEvent(window, 'resize').pipe(
      debounceTime(300),
      distinctUntilChanged(),
    );
    this.winSizeSub = this.winSizeChange$
      .subscribe(() => {
        this.recordingDisplay.scale(this.getPropScale());
      });

    if (this.isMobile()) {
      this.initTouchEvents();
    }
  }

  initRecording() {
    this.recording.connect('');
    this.recording.onplay = () => {
      this.isPlaying = true;
    };

    this.recording.onseek = (millis) => {
      this.position = formatTime(millis);
      this.percent = millis;
    };

    this.recording.onprogress = (millis) => {
      if (millis >= this.max) {
        this.duration = formatTime(millis);
        this.max = millis;
      }
      if (this.firstLoad) {
        this.recording.play();
        this.firstLoad = false;
      }
    };

    // If paused, the play/pause button should read "Play"
    this.recording.onpause = () => {
      this.isPlaying = false;
    };

    this.recordingDisplay.onresize = (width, height) => {
      // Do not scale if displayRef has no width
      if (!height) {
        return;
      }
      this.recordingDisplay.scale(this.getPropScale());
    };

    clearInterval(this.interval);

    // @ts-ignore
    this.interval = setInterval(() => {
      if (this.lastDuration === this.max) {
        clearInterval(this.interval);
        this.rangeHideClass = '';
      } else {
        this.lastDuration = this.max;
      }
    }, 1000);
  }

  destroy() {
    if (this.recording) {
      this.recording.onplay = null;
      this.recording.onseek = null;
      this.recording.onprogress = null;
      this.recording.onpause = null;
      this.recordingDisplay.onresize = null;
      this.recording.disconnect();
      this.recording = null;
    }

    if (this.recordingDisplay) {
      const recordingElement = this.recordingDisplay.getElement();
      if (recordingElement && recordingElement.parentNode) {
        recordingElement.parentNode.removeChild(recordingElement);
      }
      this.recordingDisplay = null;
    }

    if (this.winSizeSub) {
      this.winSizeSub.unsubscribe();
      this.winSizeSub = null;
    }
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.interval = null;

    this.playerRef = null;
    this.displayRef = null;
    this.screenRef = null;
    this.isPlaying = false;
    this.max = 100;
    this.percent = 0;
    this.duration = '00:00';
    this.position = '00:00';
    this.startTime = null;
    this.startTimeStamp = null;
    this.commands = [];
    this.page = 0;
    this.leftInfo = null;
    this.firstLoad = true;
    this.rangeHideClass = 'hideCursor';
    this.lastDuration = 0;
  }

  getPropScale() {
    let scale = 1;
    if (this.recordingDisplay) {
      const width = this.recordingDisplay.getWidth();
      const height = this.recordingDisplay.getHeight();
      if (!width || !height) {
        return scale;
      }
      const widthScale = this.screenRef.offsetWidth / width;
      const heightScale = this.screenRef.offsetHeight / height;
      scale = Math.min(widthScale, heightScale);
    }
    return scale;
  }

  restart() {
    this.percent = 0;
    this.runFrom();
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

  setDisableStatusSiderElement(disable: boolean) {
    const sliderElement = document.getElementById('position-slider') as HTMLInputElement;
    sliderElement.disabled = disable;
  }

  runFrom() {
    this.setDisableStatusSiderElement(true);

    this.recording.seek(this.percent, () => {
        this.playerRef.className = '';
        this.setDisableStatusSiderElement(false);
      }
    );

    // Seek is in progress
    this.playerRef.className = 'seeking';
  }

  cancelSeek(e) {
    this.recording.play();
    this.playerRef.className = '';
    e.stopPropagation();
    this.setDisableStatusSiderElement(false);
  }

  play() {
    if (!this.recording.isPlaying()) {
      this.recording.play();
      this.isPlaying = true;
    }
  }

  pause() {
    if (this.recording.isPlaying()) {
      this.recording.pause();
      this.isPlaying = false;
    }
  }

  toggle() {
    if (!this.recording.isPlaying()) {
      this.play();
    } else {
      this.pause();
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

          results.forEach((element: any) => {
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
    const time = (item.timestamp - 10) * 1000 - this.startTimeStamp;
    this.percent = time <= 0 ? 0 : time;
    this.runFrom();
  }

  private isMobile(): boolean {
    return window.innerWidth < 768;
  }

  private initTouchEvents() {
    const screen = document.getElementById('screen');
    if (!screen) { return; }

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    screen.addEventListener('touchstart', (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    });

    screen.addEventListener('touchmove', (e: TouchEvent) => {
      // 防止页面滚动
      if (Math.abs(e.touches[0].clientY - touchStartY) > 10) {
        e.preventDefault();
      }
    });

    screen.addEventListener('touchend', (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();

      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const deltaTime = touchEndTime - touchStartTime;

      // 点击判定
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 200) {
        this.toggle();
      }

      // 左右滑动判定
      if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 30) {
        const seekTime = 5000; // 5秒
        if (deltaX > 0) {
          // 向右滑动，前进
          this.percent = Math.min(this.percent + seekTime, this.max);
        } else {
          // 向左滑动，后退
          this.percent = Math.max(this.percent - seekTime, 0);
        }
        this.runFrom();
      }
    });
  }
}
