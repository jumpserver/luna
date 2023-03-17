import {Injectable} from '@angular/core';
import {Setting, GlobalSetting} from '@app/model';
import {LocalStorageService} from './share';
import {HttpClient} from '@angular/common/http';
import {I18nService} from '@app/services/i18n';
import {canvasWaterMark, getQueryParamFromURL} from '@app/utils/common';
import {BehaviorSubject} from 'rxjs';

@Injectable()
export class SettingService {
  setting: Setting;
  public globalSetting: GlobalSetting = new GlobalSetting();
  settingKey = 'LunaSetting';
  private inited = false;
  public isLoadTreeAsync$ = new BehaviorSubject<boolean>(true);
  public appletConnectMethod$ = new BehaviorSubject<string>('');

  constructor(
    private _localStorage: LocalStorageService,
    private _http: HttpClient,
    private _i18n: I18nService
  ) {
    const settingData = this._localStorage.get(this.settingKey);
    if (settingData && typeof settingData === 'object') {
      this.setting = settingData;
      this.setIsLoadTreeAsync();
      this.setAppletConnectMethod();
    } else {
      this.setting = new Setting();
    }
    this.init().then();
  }
  async getPublicSettings() {
    let url = '/api/v1/settings/public/';
    const connectionToken = getQueryParamFromURL('token');
    if (connectionToken) {
      // 解决 /luna/connect?connectToken= 直接方式权限认证问题
      url += `?token=${connectionToken}`;
    }
    this.globalSetting = await this._http.get<any>(url).toPromise();
    this.setting.commandExecution = this.globalSetting.SECURITY_COMMAND_EXECUTION;
    this.setLogo();
    this.setTitle();
    this.setFavicon();
    this.setRDPResolution();
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

  setRDPResolution() {
    const value = this._localStorage.get(this.settingKey);
    if (!value || !value.rdpResolution) {
      this.setting.rdpResolution = this.globalSetting.TERMINAL_GRAPHICAL_RESOLUTION;
    }
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
    this.setIsLoadTreeAsync();
    this.setAppletConnectMethod();
  }

  setIsLoadTreeAsync() {
    this.isLoadTreeAsync$.next(this.setting.isLoadTreeAsync === '1');
  }

  setAppletConnectMethod() {
    this.appletConnectMethod$.next(this.setting.appletConnectMethod);
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
