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
  }

}
