import {Component, OnInit} from '@angular/core';
import {Video, DataStore} from '../globals';

@Component({
  selector: 'app-test-page',
  templateUrl: './test-page.component.html',
  styleUrls: ['./test-page.component.scss']
})
export class TestPageComponent implements OnInit {
  Video = Video;

  constructor() {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    this.Video.id = 'asfafdasd';
    this.Video.src = 'https://www.w3schools.com/tags/movie.mp4';
    this.Video.height = 240;
    this.Video.width = 320;
  }

}
