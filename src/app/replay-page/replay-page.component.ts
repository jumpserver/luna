import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {HttpService, LogService} from '../app.service';
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
              private _logger: LogService) {
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
          Video.type = 'json';
          Video.json = data;
          Video.timelist = Object.keys(Video.json).map(Number);
          Video.timelist = Video.timelist.sort(function (a, b) {
            return a - b;
          });
          Video.totalTime = Video.timelist[Video.timelist.length - 1] * 1000;
        },
        err => {
          alert('无法下载');
          this._logger.error(err);
        },
      );

  }
}
