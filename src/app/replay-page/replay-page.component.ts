import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {Logger} from 'angular2-logger/core';
import {HttpService} from '../app.service';
import {Video, DataStore} from '../globals';

@Component({
  selector: 'app-replay-page',
  templateUrl: './replay-page.component.html',
  styleUrls: ['./replay-page.component.css']
})
export class ReplayPageComponent implements OnInit {
  Video = Video;

  constructor(private activatedRoute: ActivatedRoute,
              private _http: HttpService,
              private _logger: Logger) {
    // this.video = {'type': 'none'};
    DataStore.NavShow = false;

  }

  ngOnInit() {
    let token: string;
    this.activatedRoute.params.subscribe((params: Params) => {
      token = params['token'];
    });
    this._http.get('/api/terminal/v1/sessions/' + token + '/replay')
      .map(res => res.json())
      .subscribe(
        data => {
          this.Video.type = 'json';
          this.Video.json = data;
          this.Video.timelist = Object.keys(this.Video.json).map(Number);
          this.Video.timelist = this.Video.timelist.sort(function (a, b) {
            return a - b;
          });
          this.Video.totalTime = Video.timelist[Video.timelist.length - 1] * 1000;
        },
        err => {
          this._logger.error(err);
        },
      );

  }
}
