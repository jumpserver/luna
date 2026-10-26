import {Component, OnInit, OnDestroy, Input, NgZone} from '@angular/core';
import Guacamole from '@guacamole';
import {Replay, Command} from '@app/model';
import {HttpService} from '@app/services';
import {formatTime} from '@app/utils/common';
import {TranslateService} from '@ngx-translate/core';
import {Observable, fromEvent, Subscription} from 'rxjs';
import {debounceTime, distinctUntilChanged} from 'rxjs/operators';
import 'rxjs/Observable';
import {createRecordingSource} from './recording-source';


@Component({
  selector: 'elements-replay-guacamole',
  templateUrl: './guacamole.component.html',
  styleUrls: ['./guacamole.component.scss']
})
export class ElementReplayGuacamoleComponent implements OnInit, OnDestroy {
  isPlaying = false;
  recording: Guacamole.SessionRecording;
  playerRef: any;
  displayRef: any;
  screenRef: any;
  recordingDisplay: Guacamole.Display;
  recordingError = '';
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
  private subscriptions = new Subscription();
  private playbackIntent = true;
  private recordingLoaded = false;
  private seeking = false;
  private pendingSeek: number = null;
  private seekSequence = 0;
  private durationUpdatedAt = 0;
  private positionUpdatedAt = 0;

  constructor(private _http: HttpService, private _translate: TranslateService, private _zone: NgZone) {}

  ngOnInit() {
    if (!this.replay.src) {
      alert('Not found replay');
      return;
    }
    this.commands = new Array<Command>();
    const date = new Date(Date.parse(this.replay.date_start));
    this.startTime = this.toSafeLocalDateStr(date);
    this.startTimeStamp = Date.parse(this.replay.date_start);
    this.playerRef = document.getElementById('player');
    this.displayRef = document.getElementById('display');
    this.screenRef = document.getElementById('screen');
    try {
      this._zone.runOutsideAngular(() => {
        this.recording = new Guacamole.SessionRecording(createRecordingSource(this.replay.src));
        this.recordingDisplay = this.recording.getDisplay();
        const recordingElement = this.recordingDisplay.getElement();
        recordingElement.style.margin = '0 auto';
        this.screenRef.appendChild(recordingElement);
        this.initRecording();
      });
    } catch (error) {
      this.onRecordingError(error.message || String(error));
    }
    this.getCommands(this.page);
    this.subscriptions.add(this._translate.get('LeftInfo').subscribe((res: string) => {
      this.leftInfo = res;
    }));
    this.winSizeChange$ = fromEvent(window, 'resize').pipe(
      debounceTime(300),
      distinctUntilChanged(),
    );
    this.winSizeSub = this.winSizeChange$
      .subscribe(() => {
        if (this.recordingDisplay && !this.recordingError) {
          this.recordingDisplay.scale(this.getPropScale());
        }
      });
    this.subscriptions.add(this.winSizeSub);
  }

  initRecording() {
    this.recording.onplay = () => {
      this._zone.run(() => this.isPlaying = true);
    };

    this.recording.onseek = (millis) => {
      this.updatePosition(millis);
    };

    this.recording.onprogress = (millis) => {
      this.updateDuration(millis);
      this.flushPendingSeek();
      this.tryPlay();
    };

    this.recording.onpause = () => {
      this._zone.run(() => this.isPlaying = false);
      if (!this.seeking) {
        this.updatePosition(this.recording.getPosition(), true);
      }
    };

    this.recording.onload = () => {
      this.recordingLoaded = true;
      this.updateDuration(this.recording.getDuration(), true);
      this.flushPendingSeek();
      this.tryPlay();
    };

    this.recording.onerror = (message) => this.onRecordingError(message);

    this.recordingDisplay.onresize = (width, height) => {
      // Do not scale if displayRef has no width
      if (!height) {
        return;
      }
      this.recordingDisplay.scale(this.getPropScale());
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
    if (this.recording && !this.recordingError && this.playbackIntent && !this.seeking && !this.recording.isPlaying()) {
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
    this.seeking = false;
    this.pendingSeek = null;
    if (this.playerRef) {
      this.playerRef.className = '';
    }
  }

  private onRecordingError(message: string) {
    this.playbackIntent = false;
    this.seekSequence++;
    this.finishSeek();
    this._zone.run(() => {
      this.recordingError = message || 'Failed to load recording.';
      this.isPlaying = false;
    });
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.playbackIntent = false;
    this.seekSequence++;
    this.finishSeek();
    if (this.recordingDisplay) {
      this.recordingDisplay.onresize = null;
    }
    if (this.recording) {
      this.recording.onload = this.recording.onplay = this.recording.onpause = null;
      this.recording.onseek = this.recording.onprogress = this.recording.onerror = null;
      this.recording.dispose();
      this.recording = null;
    }
    if (this.recordingDisplay) {
      const element = this.recordingDisplay.getElement();
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.recordingDisplay = null;
    }
  }

  getPropScale () {
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
    const date_s = d.toLocaleString(this.getUserLang(), {hour12: false});
    return date_s.split('/').join('-');
  }
  runFrom() {
    if (!this.recording || this.recordingError) {
      return;
    }
    this.seekSequence++;
    // Keep the user's playback intent separate from the paused seek operation.
    const target = Math.max(0, Number(this.percent) || 0);
    this.seeking = true;
    this.recording.pause();
    this.pendingSeek = target;
    this.playerRef.className = 'seeking';
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
    if (!this.isPlaying && !(this.seeking && this.playbackIntent)) {
      this.play();
    } else {
      this.pause();
    }
  }

  getCommands(page: number) {
    if (!this.startTimeStamp) {
      return;
    }
    this.subscriptions.add(this._http.getCommandsData(this.replay.id, page)
    .subscribe(
      data => {
        const results = data.results;
        results.forEach(element => {
          element.atime = formatTime(element.timestamp * 1000 - this.startTimeStamp);
        });
        this.commands = this.commands.concat(results);
      },
      err => {
        alert('没找到命令记录');
      }
    ));
  }

  onScroll() {
    this.getCommands(++this.page);
  }

  commandClick(item: Command) {
    const time = (item.timestamp  - 10) * 1000 - this.startTimeStamp;
    this.percent = time <= 0 ? 0 : time;
    this.runFrom();
  }
}
