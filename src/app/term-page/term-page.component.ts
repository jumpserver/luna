import {Component, OnInit} from '@angular/core';
import {DataStore} from '../globals';

@Component({
  selector: 'app-term-page',
  templateUrl: './term-page.component.html',
  styleUrls: ['./term-page.component.scss']
})
export class TermPageComponent implements OnInit {

  constructor() {
    DataStore.NavShow = false;
  }

  ngOnInit() {
  }

}
