import {Injectable} from '@angular/core';
import {Setting, GlobalSetting} from '@app/model';
import {LocalStorageService} from './share';
import {HttpClient} from '@angular/common/http';

@Injectable()
export class SettingService {
  setting: Setting;
  globalSetting: GlobalSetting;
  settingKey: 'LunaSetting';

  constructor(private store: LocalStorageService, private _http: HttpClient) {
    const settingData = this.store.get(this.settingKey);
    if (settingData) {
      try {
        this.setting = JSON.parse(settingData) as Setting;
      } catch (e) {
        this.setting = new Setting();
      }
    } else {
      this.setting = new Setting();
    }
    this._http.get<any>('/api/v1/settings/public/').subscribe(resp => {
      this.globalSetting  = resp.data;
    });
  }

  save() {
    const settingData = JSON.stringify(this.setting);
    this.store.set(this.settingKey, settingData);
  }

  isLoadTreeAsync(): boolean {
    return this.setting.isLoadTreeAsync === '1';
  }

  // 全局跳过手动输入windows账号密码
  globalSkipAllManualPassword(): boolean {
    return this.globalSetting.WINDOWS_SKIP_ALL_MANUAL_PASSWORD;
  }

  isSkipAllManualPassword(): boolean {
    if (this.globalSkipAllManualPassword()) {
      return true;
    }
    return this.setting.isSkipAllManualPassword === '1';
  }
}
