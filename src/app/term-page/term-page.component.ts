import {Component, OnInit} from '@angular/core';
import {DataStore} from '../globals';
import {ActivatedRoute, Params} from '@angular/router';
import * as jQuery from 'jquery/dist/jquery.min.js';
import {LogService} from '../app.service';

@Component({
  selector: 'app-term-page',
  templateUrl: './term-page.component.html',
  styleUrls: ['./term-page.component.scss']
})
export class TermPageComponent implements OnInit {
  token: string;

  constructor(private activatedRoute: ActivatedRoute,
              private _logger: LogService) {
    DataStore.NavShow = false;
    this._logger.debug('TermPageComponent');
  }

  ngOnInit() {
    this.activatedRoute.params.subscribe((params: Params) => {
      this.token = params['token'];
    });
    jQuery('body').css('background-color', 'black');
  }
}
