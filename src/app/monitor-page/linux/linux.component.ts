import {Component, OnInit} from '@angular/core';

declare let jQuery: any;
declare let Terminal: any;

@Component({
  selector: 'app-monitor-linux',
  templateUrl: './linux.component.html',
  styleUrls: ['./linux.component.css']
})
export class LinuxComponent implements OnInit {
  term: any;

  constructor() {
  }

  ngOnInit() {
    let col: number;
    let row: number;
    col = Math.floor(jQuery('#term').width() / jQuery('#liuzheng').width() * 8) - 3;
    row = Math.floor(jQuery('#term').height() / jQuery('#liuzheng').height()) - 5;
    this.term = new Terminal({
      cols: col,
      rows: row,
      useStyle: true,
      screenKeys: true,
    });
    this.term.open(document.getElementById('term'), true);
    const that = this;
    window.onresize = function () {
      col = Math.floor(jQuery('#term').width() / jQuery('#liuzheng').width() * 8) - 3;
      row = Math.floor(jQuery('#term').height() / jQuery('#liuzheng').height()) - 5;

      if (col < 80) {
        col = 80;
      }
      if (row < 24) {
        row = 24;
      }
      that.term.resize(col, row);
    };
  }


}
