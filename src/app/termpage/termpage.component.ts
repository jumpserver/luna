import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {DataStore} from '../app.service';
import * as io from 'socket.io-client';

declare let jQuery: any;
declare let Terminal: any;

@Component({
  selector: 'app-termpage',
  templateUrl: './termpage.component.html',
  styleUrls: ['./termpage.component.css']
})
export class TermpageComponent implements OnInit {

  constructor(private activatedRoute: ActivatedRoute) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    let token: string;
    this.activatedRoute.params.subscribe((params: Params) => {
      token = params['token'];
    });
    const socket = io.connect('/ssh');

    const term = new Terminal({
      cols: '80',
      rows: '24',
      useStyle: true,
      screenKeys: true,
    });
    term.open(document.getElementById('term'), true);

    socket.on('connect', function () {
      socket.emit('token', token);

      term.on('data', function (data) {
        socket.emit('data', data);
      });


      socket.on('data', function (data) {
        term.write(data);
      });

      socket.on('disconnect', function () {
        term.destroy();
      });
      socket.on('resize', function (data) {
        term.resize(data.col, data.row);
      });
      // jQuery(window).resize();
    });

  }

}
