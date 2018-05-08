import {Component, Input, OnInit} from '@angular/core';
import {Replay} from '../replay.model';

@Component({
  selector: 'app-replay-mp4',
  templateUrl: './mp4.component.html',
  styleUrls: ['./mp4.component.css']
})
export class Mp4Component implements OnInit {
  @Input() replay: Replay;
  constructor() {
  }

  ngOnInit() {
    if (this.replay.height === 0) {
      this.replay.height = 600;
    }
    if (this.replay.width === 0) {
      this.replay.width = 800;
    }

  }

}
