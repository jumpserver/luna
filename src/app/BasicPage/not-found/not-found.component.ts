import {Component, OnInit} from '@angular/core';
import {NavComponent} from '../nav/nav.component'

@Component({
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.css']
})
export class NotFoundComponent implements OnInit {

  constructor() {

  }

  ngOnInit() {
    NavComponent.Hide()
  }

}
