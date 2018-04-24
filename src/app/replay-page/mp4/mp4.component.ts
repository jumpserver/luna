import {Component, Input, OnInit} from '@angular/core';
import {Video} from '../../globals';

@Component({
  selector: 'app-replay-mp4',
  templateUrl: './mp4.component.html',
  styleUrls: ['./mp4.component.css']
})
export class Mp4Component implements OnInit {
  Video = Video;

  constructor() {
  }

  ngOnInit() {
    if (this.Video.height === 0) {
      this.Video.height = 600;
    }
    if (this.Video.width === 0) {
      this.Video.width = 800;
    }

  }

}
