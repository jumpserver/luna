import {Component, OnInit, Input, ViewChild, ElementRef} from '@angular/core';
import {Endpoint, View} from '@app/model';
import {TYPE_DB_GUI, TYPE_DB_CLIENT, User} from '@app/globals';
import {AppService, SettingService} from '@app/services';
import {ActivatedRoute} from '@angular/router';

@Component({
  selector: 'elements-content-window',
  templateUrl: './content-window.component.html',
  styleUrls: ['./content-window.component.css']
})
export class ElementContentWindowComponent implements OnInit {
  @Input() view: View;
  @ViewChild('contentWindow', {static: true}) windowRef: ElementRef;
  connector: string; // koko, omnidb, lion
  loading = true;
  public id: string;

  constructor(private _settingSvc: SettingService,
              private _appSvc: AppService,
              private _route: ActivatedRoute
  ) {}

  async ngOnInit() {
    this.id = 'window-' + Math.random().toString(36).substr(2);
    this.computeConnector();
    this.createWaterMark();
    this.view.smartEndpoint = await this._appSvc.getSmartEndpoint(this.view);
    this.loading = false;
  }

  getWaterMarkContent() {
    let timestamp = '', user = '', content = '', asset = '', sessionStart = '';
    const options = this._settingSvc.globalSetting.SECURITY_WATERMARK_DISPLAY_OPTION || [];
    for (const i in options) {
      if (options[i] === 'session_start') {
        sessionStart = `${new Date().toJSON()}\n`;
      } else if (options[i] === 'asset') {
        asset = `${this.view.node.name}\n`;
      } else if (options[i] === 'timestamp') {
        timestamp = Date.now() + '\n';
      } else if (options[i] === 'user') {
        user = `${User.name}(${User.username})\n`;
      }
    }
    if (this._settingSvc.globalSetting.SECURITY_WATERMARK_DISPLAY_CONTENT) {
      content = this._settingSvc.globalSetting.SECURITY_WATERMARK_DISPLAY_CONTENT;
    }
    return `${asset}${sessionStart}${timestamp}${user}${content}`;
  }

  createWaterMark() {
    const content = this.getWaterMarkContent();
    this._settingSvc.createWaterMarkIfNeed(
      this.windowRef.nativeElement, content
    );
  }

  computeConnector() {
    switch (this.view.connectFrom) {
      case 'token':
      case 'node':
        if (this.view.connectType.id === TYPE_DB_GUI.id) {
          this.connector = 'omnidb';
        } else if (this.view.connectType.id === TYPE_DB_CLIENT.id) {
          this.connector = 'magnus';
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
}
