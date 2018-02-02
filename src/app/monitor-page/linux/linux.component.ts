import {Component, OnInit} from '@angular/core';
import {Monitor} from '../../globals';

@Component({
  selector: 'app-monitor-linux',
  templateUrl: './linux.component.html',
  styleUrls: ['./linux.component.css']
})
export class LinuxComponent implements OnInit {
  token: string;

  constructor() {
  }

  ngOnInit() {
    this.token = Monitor.token;
  }


}
