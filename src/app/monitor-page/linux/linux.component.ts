import {Component, OnInit} from '@angular/core';
import {Monitor, term} from '../../globals';
import * as io from 'socket.io-client';

import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'app-monitor-linux',
  templateUrl: './linux.component.html',
  styleUrls: ['./linux.component.css']
})
export class LinuxComponent implements OnInit {

  constructor() {
  }

  ngOnInit() {
    Monitor.socket = io.connect('/ssh');
    Monitor.socket.on('connect', function () {
      Monitor.socket.emit('room', Monitor.sessionid);
      Monitor.socket.on('room', function (room) {
        Monitor.room = room;
        Monitor.socket.emit('join', room);
        console.log(Monitor);
      });
      Monitor.socket.on('data', function (data) {
        term.term.write(data);
      });
    });
  }


}
