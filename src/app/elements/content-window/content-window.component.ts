import {Component, OnInit, Input} from '@angular/core';
import {View} from '@app/model';
import {TYPE_DB_GUI} from '@app/globals';

@Component({
  selector: 'elements-content-window',
  templateUrl: './content-window.component.html',
  styleUrls: ['./content-window.component.css']
})
export class ElementContentWindowComponent implements OnInit {
  @Input() view: View;
  connector: any; // koko, omnidb, lion

  constructor() {
  }

  ngOnInit() {
    this.computeConnector();
  }

  computeConnector() {
    switch (this.view.connectFrom) {
      case 'node':
        if (this.view.type === 'database_app' && this.view.connectType.id === TYPE_DB_GUI.id) {
          this.connector = 'omnidb';
        } else if (['rdp', 'vnc'].indexOf(this.view.protocol) > -1) {
          this.connector = 'lion';
        } else {
          this.connector = 'koko';
        }
        break;
      case 'fileManager':
        if (this.view.protocol === 'sftp') {
          this.connector = 'koko';
        }
        break;
      case 'token':
        if (this.view.type.toLowerCase().indexOf('window') > -1) {
          this.connector = 'lion';
        } else {
          this.connector = 'koko';
        }
        break;
    }
  }
}
