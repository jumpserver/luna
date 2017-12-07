import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {Logger} from 'angular2-logger/core';
import {HttpService} from '../app.service';

@Component({
  selector: 'app-replay-page',
  templateUrl: './replay-page.component.html',
  styleUrls: ['./replay-page.component.css']
})
export class ReplayPageComponent implements OnInit {
  playing: boolean;
  video: any;

  constructor(private activatedRoute: ActivatedRoute,
              private _http: HttpService,
              private _logger: Logger) {
  }

  ngOnInit() {
    let token: string;
    this.activatedRoute.params.subscribe((params: Params) => {
      token = params['token'];
    });
    this._http.get('/api/replay?' + token)
      .map(res => res.json())
      .subscribe(
        data => {
          this.video = data;
        },
        err => {
          this._logger.error(err);
        },
      );

  }

  play() {
    this.playing = !this.playing;
  }

}
