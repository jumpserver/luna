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
    this._http.getReplay(sid).subscribe(
      data => {
        this.replay.type = data['type'];
        this.replay.src = data['src'];
        this.replay.id = data['id'];
      },
      err => {
        alert('没找到录像文件');
      }
    );
  }
}
