import {Component, Input, OnInit} from '@angular/core';
import {View} from '@app/model';
import {ViewService} from '@app/services';

@Component({
  selector: 'elements-content-view',
  templateUrl: './content-view.component.html',
  styleUrls: ['./content-view.component.css']
})
export class ElementContentViewComponent implements OnInit {
  @Input() view: View;
  @Input() hasHead: boolean;
  @Input() canClose: boolean;
  connector: string; // koko, omnidb, lion

  constructor(public viewSrv: ViewService,
  ) {
  }
  async ngOnInit() {
    this.connector = this.computeConnector(this.view);
  }

  computeConnector(view) {
    let connector;
    const {connectData} = view;
    if (connectData.connectMethod.component === 'tinker') {
      // todo:  applet 使用 web gui 的方式
      connector = 'lion';
    } else {
      connector = connectData.connectMethod.component;
    }
    return connector;
  }

  getViewName() {
    const index = this.view.name.indexOf('|');
    const name = index > -1 ? this.view.name.substring(0, index) : this.view.name;
    return name;
  }

  closeSubView(view) {
    this.viewSrv.clearSubViewOfCurrentView(view);
  }
}
