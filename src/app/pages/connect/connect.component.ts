import {Component, OnInit} from '@angular/core';
import {View} from '@app/model';
import {ViewService} from '@app/services';

@Component({
  standalone: false,
  selector: 'pages-connect',
  templateUrl: 'connect.component.html',
  styleUrls: ['connect.component.scss']
})
export class PagesConnectComponent implements OnInit {
  view: View;

  constructor(public viewSrv: ViewService) {
  }

  onNewView(view) {
    setTimeout(() => {
      view.active = true;
      this.view = view;
    }, 200);
    this.viewSrv.activeView(view);

    console.log('view', this.view);
  }

  ngOnInit() {
    this.view = null;
  }
}
