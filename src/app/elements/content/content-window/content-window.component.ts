import {Component, OnInit, Input, ViewChild, ElementRef} from '@angular/core';
import {View} from '@app/model';
import {User} from '@app/globals';
import {AppService, SettingService, HttpService} from '@app/services';
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
              private _http: HttpService,
              private _route: ActivatedRoute
  ) {
  }

  async ngOnInit() {
    this.id = 'window-' + Math.random().toString(36).substr(2);
    await this.computeConnector();
    this.createWaterMark();
    this.view.smartEndpoint = await this._appSvc.getSmartEndpoint(this.view);
    setTimeout(() => { this.loading = false }, 1000);
  }

  createWaterMark() {
    this._settingSvc.createWaterMarkIfNeed(
      this.windowRef.nativeElement,
      `${User.name}(${User.username})\n${this.view.asset.name}`
    );
  }

  async computeConnector() {
    const { connectData } = this.view;
    if (connectData.connectMethod.component === 'tinker') {
      // todo:  applet 使用 web gui 的方式
      this.connector = 'lion';
    } else {
      this.connector = connectData.connectMethod.component;
    }

  }
}
