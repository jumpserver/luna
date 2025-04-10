import {Component, ElementRef, Input, OnInit, DoCheck, ViewChild, IterableDiffers} from '@angular/core';
import {View} from '@app/model';
import {User} from '@app/globals';
import {AppService, HttpService, SettingService, ViewService} from '@app/services';
import {ActivatedRoute} from '@angular/router';

@Component({
  selector: 'elements-content-window',
  templateUrl: './content-window.component.html',
  styleUrls: ['./content-window.component.css']
})
export class ElementContentWindowComponent implements OnInit, DoCheck {
  @Input() view: View;
  @ViewChild('contentWindow', {static: true}) windowRef: ElementRef;
  public id: string;
  private iterableDiffer: any;

  constructor(private _settingSvc: SettingService,
              private _appSvc: AppService,
              private _http: HttpService,
              public viewSrv: ViewService,
              private iterableDiffers: IterableDiffers,
              private _route: ActivatedRoute
  ) {
    this.iterableDiffer = this.iterableDiffers.find([]).create();
  }

  get subViews () {
    return this.view.subViews;
  }
  async ngOnInit() {
    try {
      this.id = 'window-' + Math.random().toString(36).substr(2);
      this.createWaterMark();
      this.view.smartEndpoint = await this._appSvc.getSmartEndpoint(this.view);
      this.subViews.push(this.view);
    } catch(e) {
      throw new Error(e)
    }
  }

  async ngDoCheck() {
    const iterableChanges = this.iterableDiffer.diff(this.view.subViews);

    if (iterableChanges && iterableChanges.collection.length > 1) {
      // subViews 数组发生变化
      iterableChanges.forEachAddedItem(async (item) => {
        const smartEndpoint = await this._appSvc.getSmartEndpoint(item.item).then();
        const index = this.view.subViews.findIndex(i => i.connectToken.id === item.item.connectToken.id);
        this.view.subViews[index].smartEndpoint = smartEndpoint;
      });
    }
  }

  createWaterMark() {
    this._settingSvc.createWaterMarkIfNeed(
      this.windowRef.nativeElement,
      `${User.name}(${User.username})\n${this.view.asset.name}`
    );
  }
}
