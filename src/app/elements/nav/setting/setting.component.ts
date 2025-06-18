import _ from 'lodash-es';
import xtermTheme from 'xterm-theme';
import { Subscription } from 'rxjs';
import { I18nService } from '@app/services/i18n';
import { GlobalSetting, Setting } from '@app/model';
import { NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpService, IframeCommunicationService, SettingService } from '@app/services';
import { Component, Inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { NzSelectComponent } from 'ng-zorro-antd/select';

interface terminalThemeMap {
  label: string;
  value: string;
}

@Component({
  standalone: false,
  selector: 'elements-setting',
  templateUrl: 'setting.component.html',
  styleUrls: ['setting.component.scss']
})
export class ElementSettingComponent implements OnInit, OnDestroy {
  @ViewChild('nzSel', { static: false }) nzSel!: NzSelectComponent;
  public boolChoices: any[];
  public name: string;
  public type: string = 'general';
  keyboardLayoutOptions: any[];
  resolutionsOptions: any[];
  rdpSmartSizeOptions: any[];
  colorQualityOptions: any[];
  setting: Setting = new Setting();
  globalSetting: GlobalSetting;
  rdpClientConfig = {
    full_screen: false,
    multi_screen: false,
    drives_redirect: false
  };

  currentTheme = '';
  terminalThemeMap: terminalThemeMap[] = [];
  messageSubscription: Subscription;

  constructor(
    @Inject(NZ_MODAL_DATA) public data: any,
    private _i18n: I18nService,
    private _http: HttpService,
    private settingSrv: SettingService,
    private _message: NzMessageService,
    private _iframeSvc: IframeCommunicationService
  ) {
    this.boolChoices = [
      { name: _i18n.instant('Yes'), value: true },
      { name: _i18n.instant('No'), value: false }
    ];
    this.name = data.name || this.name;
    this.type = data.type || this.type;
  }

  hasLicense() {
    return this.settingSrv.globalSetting.XPACK_LICENSE_IS_VALID;
  }

  async ngOnInit() {
    this.generateTerminalThemeMap();
    await this.getSettingOptions();
    this.setting = this.settingSrv.setting;
    this.getRdpClientConfig();
    this.globalSetting = this.settingSrv.globalSetting;
    this.currentTheme = this.setting.command_line.terminal_theme_name;
  }

  ngOnDestroy() {
    if (this.messageSubscription) {
      this.messageSubscription.unsubscribe();
    }
  }

  generateTerminalThemeMap() {
    this.terminalThemeMap = [
      { label: 'Default', value: 'Default' },
      ...Object.keys(xtermTheme).map(item => ({ label: item, value: item }))
    ];
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

  onThemePreview(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // 延迟一个 tick，等待内部 overlay 弹出并高亮变更
      setTimeout(() => {
        const activatedValue = (this.nzSel as any).activatedValue;
        this.onThemeChange(activatedValue);
      }, 100);
    }
  }

  onThemeChange(theme: string) {
    this.currentTheme = theme;
    this.setting.command_line.terminal_theme_name = theme;
    this.changeTheme(theme);
    this._http.setTerminalPreference({ basic: { terminal_theme_name: theme } }).subscribe({
      next: _res => {
        console.log('Theme saved successfully:', theme);
      },
      error: error => {
        console.error('Failed to set theme preference:', error);
      }
    });
  }

  changeTheme(theme: string) {
    this._iframeSvc.sendMessage({ name: 'TERMINAL_THEME_CHANGE', theme });
  }
}
