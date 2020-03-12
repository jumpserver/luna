import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {HttpService, LogService} from '@app/services';
import {Replay} from '@app/model';

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
  }

  ngOnInit() {
    let sid = '';
    this.route.params.subscribe(params => {
      sid = params['sid'];
    });
    const interval = setInterval(() => {
      this._http.getReplay(sid).subscribe(
        data => {
          if (data['error']) {
            alert('没找到录像文件');
            clearInterval(interval);
            return;
          }
          if (data['type']) {
            Object.assign(this.replay, data);
            clearInterval(interval);
          }
        },
        err => {
          alert('没找到录像文件');
        }
      );
    }, 2000);
  }
}
