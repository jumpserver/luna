import {Component, OnInit, Input} from '@angular/core';
import * as Guacamole from 'guacamole-common-js/dist/guacamole-common';
import {Replay, Command} from '@app/model';
import {HttpService} from '@app/services';
import {formatTime} from '@app/utils/common';
import {TranslateService} from '@ngx-translate/core';


@Component({
  selector: 'elements-replay-guacamole',
  templateUrl: './guacamole.component.html',
  styleUrls: ['./guacamole.component.scss']
})
export class ElementReplayGuacamoleComponent implements OnInit {
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
  commands: Command[];
  page = 0;
  leftInfo = null;

  constructor(private _http: HttpService,private _translate: TranslateService) {}

  ngOnInit() {
    if (!this.replay.src) {
      alert('Not found replay');
      return;
    }
    this.commands = new Array<Command>();
    const date = new Date(Date.parse(this.replay.date_start));
    this.startTime = this.toSafeLocalDateStr(date);
    this.startTimeStamp = Date.parse(this.replay.date_start)
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
    this.getCommands(this.page);
    this._translate.get('LeftInfo').subscribe((res: string) => {
      this.leftInfo = res;
  });
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
      this.duration = formatTime(millis);
      this.max = millis;
      this.play();
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
      // Scale displayRef to fit width of container
      const widthScale = this.displayRef.offsetWidth / width;
      const heightScale = this.displayRef.offsetHeight / height;
      const minScale = widthScale < heightScale ? widthScale : heightScale;
      this.recordingDisplay.scale(minScale);
    };
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
    this.recording.seek(this.percent, () =>
      this.playerRef.className = ''
    );

      // Seek is in progress
    this.playerRef.className = 'seeking';
  }

  cancelSeek(e) {
    this.recording.play();
    this.playerRef.className = '';
    e.stopPropagation();
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
    if (!this.startTimeStamp){
      return;
    }
    this._http.getCommandsData(this.replay.id, page)
    .subscribe(
      data => {
        let results = data.results
        results.forEach(element => {
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

  commandClick(item: Command){
    let time = (item.timestamp  - 10) * 1000 - this.startTimeStamp
    this.percent = time <=0 ? 0 : time;
    this.runFrom()
  }
}
