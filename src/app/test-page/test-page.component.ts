import {Component, OnInit} from '@angular/core';
import {DataStore} from '../globals';

@Component({
  selector: 'app-test-page',
  templateUrl: './test-page.component.html',
  styleUrls: ['./test-page.component.scss']
})
export class TestPageComponent implements OnInit {

  constructor() {
    DataStore.NavShow = false;
  }

  ngOnInit() {
  }

}
