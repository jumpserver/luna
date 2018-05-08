import {Component, OnInit} from '@angular/core';
import {DataStore} from '../../globals';

@Component({
  selector: 'pages-blank',
  templateUrl: './blank.component.html',
  styleUrls: ['./blank.component.scss']
})
export class PagesBlankComponent implements OnInit {

  constructor() {
    DataStore.NavShow = false;
  }

  ngOnInit() {
  }

}
