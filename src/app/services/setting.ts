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
      try {
        this.setting = JSON.parse(settingData) as Setting;
      } catch (e) {
        this.setting = new Setting();
      }
    } else {
      this.setting = new Setting();
    }
  }

  save() {
    const settingData = JSON.stringify(this.setting);
    this.store.set(this.settingKey, settingData);
  }

  isLoadTreeAsync(): boolean {
    return this.setting.isLoadTreeAsync === '1';
  }

  isSkipAllManualPassword(): boolean {
    return this.setting.isSkipAllManualPassword === '1';
  }
}
