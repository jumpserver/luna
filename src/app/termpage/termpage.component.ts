import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {DataStore} from "../app.service";
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
    let socket = io.connect();
    let term = new Terminal({
      cols: '80',
      rows: '24',
      useStyle: true,
      screenKeys: true,
    });

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

      window.onresize = function () {
        let col = Math.floor(jQuery('#term').width() / jQuery('#liuzheng').width() * 8) - 3;
        let row = Math.floor(jQuery('#term').height() / jQuery('#liuzheng').height()) - 5;
        let rows = 24;
        let cols = 80;


        if (col < 80) col = 80;
        if (row < 24) row = 24;
        if (cols == col && row == rows) {
        } else {
          socket.emit('resize', [col, row]);
          term.resize(col, row);
        }
      };
      jQuery(window).resize();
    });

  }

}
