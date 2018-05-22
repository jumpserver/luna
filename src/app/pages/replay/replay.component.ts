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
          this.replay.type = data['type'];
          this.replay.src = data['src'];
          this.replay.id = data['id'];
        },
        err => {
          this._http.get_replay(token);
          alert('没找到录像文件');
        }
      );
  }
}
