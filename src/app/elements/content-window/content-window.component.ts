import {Component, OnInit, Input, ViewChild, ElementRef} from '@angular/core';
import {View} from '@app/model';
import {TYPE_DB_GUI} from '@app/globals';
import {canvasWaterMark} from '@app/utils/common';
import {User} from '@app/globals';
import {SettingService} from '@app/services';

@Component({
  selector: 'elements-content-window',
  templateUrl: './content-window.component.html',
  styleUrls: ['./content-window.component.css']
})
export class ElementContentWindowComponent implements OnInit {
  @Input() view: View;
  @ViewChild('contentWindow', {static: true}) windowRef: ElementRef;
  connector: any; // koko, omnidb, lion
  public id: string;

  constructor(private _settingSvc: SettingService) {
  }

  ngOnInit() {
    this.computeConnector();
    this.id = 'window-' + Math.random().toString(36).substr(2);
    this.createWaterMarkIfNeed();
  }

  computeConnector() {
    switch (this.view.connectFrom) {
      case 'token':
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
    }
  }

  createWaterMarkIfNeed() {
    if (this._settingSvc.globalSetting.SECURITY_WATERMARK_ENABLED) {
      canvasWaterMark({
        container: this.windowRef.nativeElement,
        content: `${User.name}(${User.username})`,
      });
    }
  }
}
