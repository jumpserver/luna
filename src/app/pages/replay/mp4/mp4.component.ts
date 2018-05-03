import {Component, Input, OnInit} from '@angular/core';
import {Video} from '../replay.model';

@Component({
  selector: 'app-replay-mp4',
  templateUrl: './mp4.component.html',
  styleUrls: ['./mp4.component.css']
})
export class Mp4Component implements OnInit {
  @Input() video: Video;
  constructor() {
  }

  ngOnInit() {
    if (this.video.height === 0) {
      this.video.height = 600;
    }
    if (this.video.width === 0) {
      this.video.width = 800;
    }

  }

}
