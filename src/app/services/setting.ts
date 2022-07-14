import {Injectable} from '@angular/core';
import {Setting, GlobalSetting} from '@app/model';
import {LocalStorageService} from './share';
import {HttpClient} from '@angular/common/http';
import {I18nService} from '@app/services/i18n';
import {canvasWaterMark} from '@app/utils/common';

@Injectable()
export class SettingService {
  setting: Setting;
  public globalSetting: GlobalSetting = new GlobalSetting();
  settingKey = 'LunaSetting';
  private inited = false;

  constructor(
    private _localStorage: LocalStorageService,
    private _http: HttpClient,
    private _i18n: I18nService
  ) {
    const settingData = this._localStorage.get(this.settingKey);
    if (settingData && typeof settingData === 'object') {
      this.setting = settingData;
    } else {
      this.setting = new Setting();
    }
    this.init().then();
  }
  async getPublicSettings() {
    this.globalSetting = await this._http.get<any>('/api/v1/settings/public/').toPromise();
    this.setting.commandExecution = this.globalSetting.SECURITY_COMMAND_EXECUTION;

    this.setLogo();
    this.setTitle();
    this.setFavicon();
    return new Promise((resolve) => { resolve(true); });
  }

  setTitle() {
    document.title = this._i18n.instant('Web Terminal') + ` - ${this.globalSetting.INTERFACE.login_title}`;
  }

  setLogo() {
    const logoRef: any = document.getElementById('left-logo');
    const logoLogout = this.globalSetting.INTERFACE.logo_logout;
    if (logoLogout && logoRef) {
      logoRef.src = logoLogout;
    }
  }

  setFavicon() {
    // 更改favicon
    const link: any = document.querySelector('link[rel*=\'icon\']') ||
      document.createElement('link');
    document.getElementsByTagName('head')[0].appendChild(link);
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = this.globalSetting.INTERFACE.favicon;
  }

  setPrimaryColor() {
    const primaryColor = this.globalSetting.INTERFACE['primary_color'];
    if (primaryColor) {
      document.body.style.setProperty('--primary-color', primaryColor);
    }
  }

  async init() {
    if (this.inited) {
      return ;
    }
    await this.getPublicSettings();
    this.inited = true;
  }

  save() {
    this._localStorage.set(this.settingKey, this.setting);
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

  createWaterMarkIfNeed(element, content) {
    this.init().then(() => {
      if (this.globalSetting.SECURITY_WATERMARK_ENABLED) {
        canvasWaterMark({
          container: element,
          content: content
        });
      }
    });
  }

  hasXPack() {
    return this.globalSetting.XPACK_LICENSE_IS_VALID;
  }
}
