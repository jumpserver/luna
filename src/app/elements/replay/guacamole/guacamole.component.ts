import {Component, OnInit, Input} from '@angular/core';
import * as Guacamole from 'guacamole-common-js/dist/guacamole-common';
import {Replay} from '@app/model';

function zeroPad(num, minLength) {
  let str = num.toString();
  // Add leading zeroes until string is long enough
  while (str.length < minLength) {
    str = '0' + str;
  }
  return str;
}

function formatTimeWithSeconds(seconds) {
  let hour = 0, minute = 0, second = 0;
  const ref = [3600, 60, 1];
  for (let i = 0; i < ref.length; i++) {
    const val = ref[i];
    while (val <= seconds) {
      seconds -= val;
      switch (i) {
        case 0:
          hour++;
          break;
        case 1:
          minute++;
          break;
        case 2:
          second++;
          break;
      }
    }
  }
  return [hour, minute, second];
}

function formatTime(millis: number) {
  const totalSeconds = millis / 1000;
  const [hour, minute, second] = formatTimeWithSeconds(totalSeconds);
  let time = zeroPad(minute, 2) + ':' + zeroPad(second, 2);
  if (hour > 0) {
    time = zeroPad(hour, 2) + ':' + time;
  }
  return time;
}


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
  starttime = null;

  constructor() { }

  ngOnInit() {
    if (!this.replay.src) {
      alert('Not found replay');
      return;
    }
    const date = new Date(Date.parse(this.replay.date_start));
    this.starttime = this.toSafeLocalDateStr(date);
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
    let userLangEN = document.cookie.indexOf('django_language=en');
    if (userLangEN === -1) {
    return 'zh-CN';
    } else {
    return 'en-US';
    }
  }
  toSafeLocalDateStr(d) {
    let date_s = d.toLocaleString(this.getUserLang(), {hour12: false});
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
}
