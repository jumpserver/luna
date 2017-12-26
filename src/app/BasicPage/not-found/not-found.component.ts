import {Component, OnInit} from '@angular/core';
import {DataStore} from '../../globals';

@Component({
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.css']
})
export class NotFoundComponent implements OnInit {

  constructor() {

  }

  ngOnInit() {
    DataStore.NavShow = false;
  }

}
