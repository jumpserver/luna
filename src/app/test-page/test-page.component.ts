import {Component, OnInit} from '@angular/core';
import {DataStore, Video} from '../globals';

@Component({
  selector: 'app-test-page',
  templateUrl: './test-page.component.html',
  styleUrls: ['./test-page.component.scss']
})
export class TestPageComponent implements OnInit {

  constructor() {
  }

  ngOnInit() {
    Video.id = 'asfafdasd';
    Video.src = 'https://www.w3schools.com/tags/movie.mp4';
  }

}
