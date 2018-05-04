import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {HttpService, LogService} from '../../app.service';
import {DataStore} from '../../globals';
import {Replay} from './replay.model';

@Component({
  selector: 'pages-replay',
  templateUrl: './replay.component.html',
  styleUrls: ['./replay.component.css']
})
export class PagesReplayComponent implements OnInit {
  replay: Replay = new Replay();

  constructor(private route: ActivatedRoute,
              private _http: HttpService,
              private _logger: LogService) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    let token = '';
    this.route.params
      .subscribe(params => {
        token = params['token'];
      });
    this._http.get_replay_json(token)
      .subscribe(
        data => {
          // this.replay = data.json() as Replay;
          this.replay.type = data['type'];
          this.replay.src = data['src'];
          this.replay.id = data['id'];
        },
        err => {
          this._http.get_replay(token)
            .subscribe(
              data => {
                this.replay.type = 'json';
                this.replay.json = data;
                this.replay.src = 'READY';
                this.replay.timelist = Object.keys(this.replay.json).map(Number);
                this.replay.timelist = this.replay.timelist.sort(function (a, b) {
                  return a - b;
                });
                this.replay.totalTime = this.replay.timelist[this.replay.timelist.length - 1] * 1000;

              }, err2 => {
                alert('无法下载');
                this._logger.error(err2);
              },
            );
        }
      );

  }
}
