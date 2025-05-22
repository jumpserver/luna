import {Component, Input, OnInit} from '@angular/core';
import {HttpService, SettingService} from '@app/services';
import {GlobalSetting, Setting} from '@app/model';
import {I18nService} from '@app/services/i18n';
import * as _ from 'lodash';

@Component({
  selector: 'elements-setting',
  templateUrl: './setting.component.html',
  styleUrls: ['./setting.component.scss']
})
export class ElementSettingComponent implements OnInit {
  public boolChoices: any[];
  @Input() public name: string;
  @Input() public type: string = 'general';
  keyboardLayoutOptions: any[];
  resolutionsOptions: any[];
  rdpSmartSizeOptions: any[];
  colorQualityOptions: any[];
  setting: Setting = new Setting();
  globalSetting: GlobalSetting;
  rdpClientConfig = {
    full_screen: false,
    multi_screen: false,
    drives_redirect: false,
  };

  constructor(private _i18n: I18nService,
              private _http: HttpService,
              private settingSrv: SettingService) {
    this.boolChoices = [
      {name: _i18n.instant('Yes'), value: true},
      {name: _i18n.instant('No'), value: false}
    ];
  }

  hasLicense() {
    return this.settingSrv.globalSetting.XPACK_LICENSE_IS_VALID;
  }

  async ngOnInit() {
    await this.getSettingOptions();
    this.setting = this.settingSrv.setting;
    this.getRdpClientConfig();
    this.globalSetting = this.settingSrv.globalSetting;
  }

  async getSettingOptions() {
    const url = '/api/v1/users/preference/?category=luna';
    const res: any = await this._http.options(url).toPromise();
    const graphics = res.actions.GET.graphics.children;
    this.resolutionsOptions = graphics.rdp_resolution.choices;
    this.rdpSmartSizeOptions = graphics.rdp_smart_size.choices;
    this.colorQualityOptions = graphics.rdp_color_quality.choices;
    this.keyboardLayoutOptions = graphics.keyboard_layout.choices;
  }

  getRdpClientConfig() {
    const rdpClientConfig = this.setting.graphics.rdp_client_option || [];
    for (const i of rdpClientConfig) {
      this.rdpClientConfig[i] = true;
    }
  }

  setRdpClientConfig() {
    let rdpClientConfig = this.setting.graphics.rdp_client_option || [];
    for (const i in this.rdpClientConfig) {
      if (this.rdpClientConfig[i]) {
        rdpClientConfig.push(i);
      } else {
        rdpClientConfig = _.pull(rdpClientConfig, i);
      }
    }
    this.setting.graphics.rdp_client_option = _.uniq(rdpClientConfig);
  }

  onSubmit() {
    this.setRdpClientConfig();
    this.settingSrv.save();
  }
}
