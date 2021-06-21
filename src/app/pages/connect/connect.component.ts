import {Component, OnInit} from '@angular/core';
import {View} from '@app/model';

@Component({
  selector: 'pages-connect',
  templateUrl: './connect.component.html',
  styleUrls: ['./connect.component.scss']
})
export class PagesConnectComponent implements OnInit {
  view: View;

  constructor() {
  }

  onNewView(view) {
    setTimeout(() => {
      view.active = true;
      this.view = view;
    }, 200);
  }

  ngOnInit() {
    this.view = null;
  }
}
