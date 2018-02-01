import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {DataStore, Monitor} from '../globals';

@Component({
  selector: 'app-monitor-page',
  templateUrl: './monitor-page.component.html',
  styleUrls: ['./monitor-page.component.css']
})
export class MonitorPageComponent implements OnInit {

  constructor(private activatedRoute: ActivatedRoute) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    this.activatedRoute.params.subscribe((params: Params) => {
      Monitor.token = params['token'];
      Monitor.type = 'term';
      console.log(Monitor);
    });

  }
}
