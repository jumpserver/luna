import {Component, OnInit} from '@angular/core';
import {Monitor} from '@app/globals';

@Component({
  selector: 'pages-monitor-linux',
  templateUrl: './linux.component.html',
  styleUrls: ['./linux.component.css']
})
export class PagesMonitorLinuxComponent implements OnInit {
  token: string;

  constructor() {
  }

  ngOnInit() {
    this.token = Monitor.token;
  }


}
