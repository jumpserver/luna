import {Component, OnInit, Input, ViewChild, ElementRef} from '@angular/core';
import {View} from '@app/model';
import {User} from '@app/globals';
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
  permToken: string;
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

  createWaterMark() {
    this._settingSvc.createWaterMarkIfNeed(
      this.windowRef.nativeElement,
      `${User.name}(${User.username})\n${this.view.node.name}`
    );
  }

  computeConnector() {
    const response = this._appSvc.createPermToken();
    this.connector = this.view.connectMethod.component;
    this.permToken = response.token;
  }
}
