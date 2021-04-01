import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import { NgxWatermarkOptions } from 'ngx-watermark';
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

  options: NgxWatermarkOptions = {
    text: 'This is NGX-WATERMARK\nSimple watermark text\nmultiple line and custom font',
    width: 350,
    height: 300,
    fontFamily: 'Kanit',
    color: '#999',
    alpha: 0.7,
    degree: -45,
    fontSize: '20px',
  };

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
