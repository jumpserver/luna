import {Component, OnInit} from '@angular/core';
import {DataStore} from '../globals';
import {ActivatedRoute, Params} from '@angular/router';
import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'app-term-page',
  templateUrl: './term-page.component.html',
  styleUrls: ['./term-page.component.scss']
})
export class TermPageComponent implements OnInit {
  token: string;

  constructor(private activatedRoute: ActivatedRoute) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    this.activatedRoute.params.subscribe((params: Params) => {
      this.token = params['token'];
    });
    jQuery('body').css('background-color', 'black');
  }
}
