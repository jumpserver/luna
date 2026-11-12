import {
  Component,
  Input,
  OnChanges,
  AfterViewInit,
  SimpleChanges,
  ViewEncapsulation,
  OnDestroy,
  Output,
  EventEmitter,
  ElementRef,
  NgZone
} from '@angular/core';
import Guacamole from '@guacamole';
import { Command, Replay } from '@app/model';
import { HttpService } from '@app/services';
import { formatTime } from '@app/utils/common';
import { TranslateService } from '@ngx-translate/core';
import { fromEvent, Observable, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { createRecordingSource } from './recording-source';

@Component({
  standalone: false,
  selector: 'elements-replay-guacamole',
  templateUrl: 'guacamole.component.html',
  styleUrls: ['guacamole.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class ElementReplayGuacamoleComponent implements OnChanges, AfterViewInit, OnDestroy {
  isPlaying = false;
  isSeeking = false;
  recording: Guacamole.SessionRecording;
  playerRef: any;
  displayRef: any;
  screenRef: any;
  recordingDisplay: Guacamole.Display;
  recordingError = '';
  resizeObserver: any;
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
  rangeHideClass = 'hideCursor';
  initializedCommand: boolean = false;
  commandsCollapsed: boolean = false;
  private subscriptions = new Subscription();
  private playbackIntent = true;
  private recordingLoaded = false;
  private pendingSeek: number = null;
  private seekSequence = 0;
  private durationUpdatedAt = 0;
  private positionUpdatedAt = 0;
  private viewInitialized = false;
  private destroyed = false;
  private initializeTimer: ReturnType<typeof setTimeout>;
  private scaleTimers = new Set<ReturnType<typeof setTimeout>>();

  @Output() ready = new EventEmitter<void>();

  constructor(
    private _http: HttpService,
    private _translate: TranslateService,
    private _zone: NgZone,
    private _element: ElementRef<HTMLElement>
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.viewInitialized && !this.destroyed && changes['replay']) {
      this.destroy();

      this.initializeTimer = setTimeout(() => {
        this.initializeTimer = null;
        this.initialize();
      }, 50);
    }
  }

  ngAfterViewInit() {
    this.viewInitialized = true;
    this.initialize();
    this.applyScaleWithRetry(500);
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.destroy();
  }

  initialize() {
    if (this.destroyed || this.recording) {
      return;
    }
    if (!this.replay || !this.replay.src) {
      return alert('Not found replay');
    }

    this.commands = [];

    const date = new Date(Date.parse(this.replay.date_start));
    this.startTime = this.toSafeLocalDateStr(date);
    this.startTimeStamp = Date.parse(this.replay.date_start);

    this.playerRef = this._element.nativeElement.querySelector('#player');
    this.displayRef = this._element.nativeElement.querySelector('.display');
    this.screenRef = this._element.nativeElement.querySelector('#screen');

    if (!this.screenRef) {
      return;
    }

    this.playbackIntent = true;
    try {
      this._zone.runOutsideAngular(() => {
        this.recording = new Guacamole.SessionRecording(createRecordingSource(this.replay.src));
        this.recordingDisplay = this.recording.getDisplay();
        const recordingElement = this.recordingDisplay.getElement();
        recordingElement.style.margin = '0 auto';
        this.screenRef.appendChild(recordingElement);
        this.initRecording();
      });

      if (!this.initializedCommand) {
        this.getCommands(this.page);
        this.initializedCommand = true;
      }

      this.subscriptions.add(
        this._translate.get('LeftInfo').subscribe((res: string) => {
          this.leftInfo = res;
        })
      );

      this.winSizeChange$ = fromEvent(window, 'resize').pipe(
        debounceTime(300),
        distinctUntilChanged()
      );
      this.winSizeSub = this.winSizeChange$.subscribe(() => {
        if (this.recordingDisplay && this.screenRef && !this.recordingError) {
          this.applyScaleWithRetry(300);
        }
      });
      this.subscriptions.add(this.winSizeSub);

      // 监听容器尺寸变化，避免侧栏展开/收起或布局变化时未触发 window.resize 的情况
      if ('ResizeObserver' in window && this.screenRef) {
        this.resizeObserver = new (window as any).ResizeObserver(() => {
          this.applyScaleWithRetry(100);
        });
        try {
          this.resizeObserver.observe(this.screenRef);
        } catch (e) {
          // 忽略观察器异常
        }
      }

      if (this.isMobile()) {
        this.initTouchEvents();
      }
    } catch (error) {
      this.onRecordingError(error.message || String(error));
    }
  }

  initRecording() {
    this.recording.onload = () => {
      this.recordingLoaded = true;
      this.updateDuration(this.recording.getDuration(), true);
      this._zone.run(() => (this.rangeHideClass = ''));
      this.flushPendingSeek();
      this.tryPlay();
      this.applyScaleWithRetry(200);
    };

    this.recording.onplay = () => {
      this._zone.run(() => {
        this.isPlaying = true;
        this.ready.emit();
      });
      this.applyScaleWithRetry(100);
    };

    this.recording.onseek = millis => {
      this.updatePosition(millis);
    };

    this.recording.onprogress = millis => {
      this.updateDuration(millis);
      this.flushPendingSeek();
      this.tryPlay();
    };

    this.recording.onpause = () => {
      this._zone.run(() => (this.isPlaying = false));
      if (!this.isSeeking) {
        this.updatePosition(this.recording.getPosition(), true);
      }
    };

    this.recording.onerror = message => this.onRecordingError(message);

    this.recordingDisplay.onresize = (width, height) => {
      // Do not scale if displayRef has no width
      if (!height) {
        return;
      }
      this.applyScaleWithRetry(100);
    };
  }

  private updateDuration(millis: number, force = false) {
    const now = Date.now();
    if (!force && now - this.durationUpdatedAt < 100) {
      return;
    }
    this.durationUpdatedAt = now;
    this._zone.run(() => {
      this.duration = formatTime(millis);
      this.max = millis;
    });
  }

  private updatePosition(millis: number, force = false) {
    const now = Date.now();
    if (!force && now - this.positionUpdatedAt < 100) {
      return;
    }
    this.positionUpdatedAt = now;
    this._zone.run(() => {
      this.position = formatTime(millis);
      this.percent = millis;
    });
  }

  private tryPlay() {
    if (
      this.recording &&
      !this.recordingError &&
      this.playbackIntent &&
      !this.isSeeking &&
      !this.recording.isPlaying()
    ) {
      this._zone.runOutsideAngular(() => this.recording.play());
    }
  }

  private flushPendingSeek() {
    if (this.pendingSeek === null || !this.recording || this.recordingError) {
      return;
    }
    const duration = this.recording.getDuration();
    if (!this.recordingLoaded && duration < this.pendingSeek) {
      return;
    }
    const target = Math.min(this.pendingSeek, duration);
    const sequence = this.seekSequence;
    this.pendingSeek = null;
    const complete = () => {
      if (!this.recording || sequence !== this.seekSequence) {
        return;
      }
      this.finishSeek();
      this.updatePosition(this.recording.getPosition(), true);
      this.tryPlay();
    };
    if (duration <= 0) {
      complete();
    } else {
      this._zone.runOutsideAngular(() => this.recording.seek(target, complete));
    }
  }

  private finishSeek() {
    this.pendingSeek = null;
    this._zone.run(() => (this.isSeeking = false));
    if (this.playerRef) {
      this.playerRef.classList.remove('seeking');
    }
  }

  private onRecordingError(message: string) {
    this.playbackIntent = false;
    this.seekSequence++;
    this.finishSeek();
    this._zone.run(() => {
      this.recordingError = message || 'Failed to load recording.';
      this.isPlaying = false;
      this.rangeHideClass = '';
      this.ready.emit();
    });
  }

  private applyScaleWithRetry(delay: number = 100, maxRetries: number = 5) {
    let retryCount = 0;

    const tryApplyScale = () => {
      if (this.recordingDisplay && this.screenRef) {
        const width = this.recordingDisplay.getWidth();
        const height = this.recordingDisplay.getHeight();

        if (width > 0 && height > 0) {
          const scale = this.getPropScale();
          this.recordingDisplay.scale(scale);
          return true;
        } else if (retryCount < maxRetries) {
          retryCount++;
          this.scheduleScale(tryApplyScale, delay);
          return false;
        } else {
          return false;
        }
      }
      return false;
    };

    this.scheduleScale(tryApplyScale, delay);
  }

  private scheduleScale(callback: () => void, delay: number) {
    if (this.destroyed || this.recordingError) {
      return;
    }
    const timer = setTimeout(() => {
      this.scaleTimers.delete(timer);
      callback();
    }, delay);
    this.scaleTimers.add(timer);
  }

  destroy() {
    clearTimeout(this.initializeTimer);
    this.initializeTimer = null;
    this.scaleTimers.forEach(timer => clearTimeout(timer));
    this.scaleTimers.clear();
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    this.playbackIntent = false;
    this.seekSequence++;
    this.finishSeek();
    if (this.recording) {
      this.recording.onload = null;
      this.recording.onplay = null;
      this.recording.onseek = null;
      this.recording.onprogress = null;
      this.recording.onpause = null;
      this.recording.onerror = null;
      this.recordingDisplay.onresize = null;
      this.recording.dispose();
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
    if (this.resizeObserver) {
      try {
        this.resizeObserver.disconnect();
      } catch (e) {}
      this.resizeObserver = null;
    }

    this.playerRef = null;
    this.displayRef = null;
    this.screenRef = null;
    this.isPlaying = false;
    this.isSeeking = false;
    this.max = 100;
    this.percent = 0;
    this.duration = '00:00';
    this.position = '00:00';
    this.startTime = null;
    this.startTimeStamp = null;
    this.commands = [];
    this.page = 0;
    this.leftInfo = null;
    this.recordingError = '';
    this.recordingLoaded = false;
    this.rangeHideClass = 'hideCursor';
    this.durationUpdatedAt = 0;
    this.positionUpdatedAt = 0;
    this.initializedCommand = false;
  }

  getPropScale() {
    let scale = 1;
    if (this.recordingDisplay && this.screenRef) {
      const width = this.recordingDisplay.getWidth();
      const height = this.recordingDisplay.getHeight();

      if (!width || !height) {
        return scale;
      }

      const containerRect = this.screenRef.getBoundingClientRect();
      const availableWidth = containerRect.width - 32; // 减去padding
      const availableHeight = containerRect.height - 32;

      if (availableWidth <= 0 || availableHeight <= 0) {
        return scale;
      }

      const widthScale = availableWidth / width;
      const heightScale = availableHeight / height;
      // 允许放大以自适应容器
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

  runFrom() {
    if (!this.recording || this.recordingError) {
      return;
    }
    this.seekSequence++;
    const target = Math.max(0, Number(this.percent) || 0);
    this.isSeeking = true;
    this.recording.pause();
    this.pendingSeek = target;
    this.playerRef.classList.add('seeking');
    this.flushPendingSeek();
  }

  cancelSeek(e) {
    this.seekSequence++;
    if (this.recording && !this.recordingError) {
      this.recording.cancel();
      this.updatePosition(this.recording.getPosition(), true);
    }
    this.finishSeek();
    this.tryPlay();
    e.stopPropagation();
  }

  play() {
    this.playbackIntent = true;
    this.tryPlay();
  }

  pause() {
    this.playbackIntent = false;
    this.seekSequence++;
    this.finishSeek();
    if (this.recording && !this.recordingError) {
      this.recording.pause();
    }
  }

  toggle() {
    if (!this.recording || this.recordingError) {
      return;
    }
    if (!this.playbackIntent) {
      this.play();
    } else {
      this.pause();
    }
  }

  getCommands(page: number) {
    if (!this.startTimeStamp) {
      return;
    }

    this.subscriptions.add(
      this._http.getCommandsData(this.replay.id, page).subscribe(
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
      )
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

  trackByCommand(index: number, item: Command): any {
    return item.timestamp || index;
  }

  private isMobile(): boolean {
    return window.innerWidth < 768;
  }

  private initTouchEvents() {
    const screen = this.screenRef;

    if (!screen) {
      return;
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const touchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    };

    const touchMove = (e: TouchEvent) => {
      // 防止页面滚动
      if (Math.abs(e.touches[0].clientY - touchStartY) > 10) {
        e.preventDefault();
      }
    };

    const touchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();

      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const deltaTime = touchEndTime - touchStartTime;

      // 点击判定
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 200) {
        // The screen's click handler handles taps, including synthetic mobile clicks.
        return;
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
    };
    screen.addEventListener('touchstart', touchStart);
    screen.addEventListener('touchmove', touchMove, { passive: false });
    screen.addEventListener('touchend', touchEnd);
    this.subscriptions.add(() => {
      screen.removeEventListener('touchstart', touchStart);
      screen.removeEventListener('touchmove', touchMove);
      screen.removeEventListener('touchend', touchEnd);
    });
  }

  toggleCommands() {
    this.commandsCollapsed = !this.commandsCollapsed;
    this.applyScaleWithRetry(100);
  }
}
