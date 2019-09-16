import {Injectable} from '@angular/core';
import {Setting} from '@app/model';
import {LocalStorageService} from './share';

@Injectable()
export class SettingService {
  setting: Setting;
  settingKey: 'LunaSetting';

  constructor(private store: LocalStorageService) {
    const settingData = this.store.get(this.settingKey);
    if (settingData) {
      this.setting = JSON.parse(settingData) as Setting;
    } else {
      this.setting = new Setting();
    }
  }

  save() {
    const settingData = JSON.stringify(this.setting);
    this.store.set(this.settingKey, settingData);
  }

  isLoadTreeAsync() {
    return this.setting.isLoadTreeAsync;
  }

  isSkipAllManualPassword() {
    return this.setting.isSkipAllManualPassword;
  }
}
