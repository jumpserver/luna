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
    this._http.get_replay(token)
      .subscribe(
        data => {
          Video.type = data['type'];
          Video.src = data['src'];
          Video.id = data['id'];
          Video.width = data['width'];
          Video.height = data['height'];
        },
        err => {
          alert('API请求出错');
          this._logger.error(err);
        }
      );

  }
}
