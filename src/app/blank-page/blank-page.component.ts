import {Component, OnInit} from '@angular/core';
import {DataStore} from '../globals';

@Component({
  selector: 'app-blank-page',
  templateUrl: './blank-page.component.html',
  styleUrls: ['./blank-page.component.scss']
})
export class BlankPageComponent implements OnInit {

  constructor() {
    DataStore.NavShow = false;
  }

  ngOnInit() {
  }

}
