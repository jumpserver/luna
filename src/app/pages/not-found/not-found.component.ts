import {Component, OnInit} from '@angular/core';
import {DataStore} from '../../globals';

@Component({
  selector: 'pages-not-found',
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.css']
})
export class PagesNotFoundComponent implements OnInit {

  constructor() {

  }

  ngOnInit() {
    DataStore.NavShow = false;
  }

}
