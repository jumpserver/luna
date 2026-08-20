import _ from 'lodash-es';
import xtermTheme from 'xterm-theme';
import { I18nService } from '@app/services/i18n';
import { GlobalSetting, Setting } from '@app/model';
import { NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpService, IframeCommunicationService, SettingService } from '@app/services';
import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { NzSelectComponent } from 'ng-zorro-antd/select';
import { withSitePrefix } from '@app/utils/path';
import { useTheme } from '@src/sass/theme/util';

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
export class ElementSettingComponent implements OnInit {
  @ViewChild('nzSel', { static: false }) nzSel!: NzSelectComponent;
  public boolChoices: any[];
  public name: string;
  public type: string = 'general';
  keyboardLayoutOptions: any[];
  resolutionsOptions: any[];
  rdpSmartSizeOptions: any[];
  colorQualityOptions: any[];
  connectDefaultOpenMethodOptions: any[];
  themeOptions: any[];
  fileNameConflictResolutionOptions: any[];
  connectDefaultOpenMethodLabel = '';
  themeLabel = '';
  fileNameConflictResolutionLabel = '';
  setting: Setting = new Setting();
  globalSetting: GlobalSetting;
  rdpClientConfig = {
    full_screen: false,
    multi_screen: false,
    drives_redirect: false,
    remote_microphone: false
  };

  currentTheme = '';
  terminalThemeMap: terminalThemeMap[] = [];
  compactLayout = true;
  labelSpan = 8;
  controlSpan = 16;
  private saveInProgress = false;
  private pendingChanges: Record<string, Record<string, any>> = {};

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
    this.compactLayout = this.isCompactLang();
    this.labelSpan = this.compactLayout ? 8 : 24;
    this.controlSpan = this.compactLayout ? 16 : 24;
  }

  private isCompactLang(): boolean {
    const lang = (this._i18n.getLangCode() || '').toLowerCase().replace('_', '-');
    return lang.startsWith('zh') || lang.startsWith('ja') || lang.startsWith('ko');
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

  generateTerminalThemeMap() {
    this.terminalThemeMap = [
      { label: 'Default', value: 'Default' },
      ...Object.keys(xtermTheme).map(item => ({ label: item, value: item }))
    ];
  }

  async getSettingOptions() {
    const url = withSitePrefix('/api/v1/users/preference/?category=luna');
    const res: any = await this._http.options(url).toPromise();
    const basic = res.actions.GET.basic.children;
    const graphics = res.actions.GET.graphics.children;
    this.connectDefaultOpenMethodOptions = basic.connect_default_open_method.choices;
    this.themeOptions = basic.themes.choices;
    this.connectDefaultOpenMethodLabel = basic.connect_default_open_method.label;
    this.themeLabel = basic.themes.label;
    this.resolutionsOptions = graphics.rdp_resolution.choices;
    this.rdpSmartSizeOptions = graphics.rdp_smart_size.choices;
    this.colorQualityOptions = graphics.rdp_color_quality.choices;
    this.keyboardLayoutOptions = graphics.keyboard_layout.choices;
    this.fileNameConflictResolutionOptions = graphics.file_name_conflict_resolution.choices;
    this.fileNameConflictResolutionLabel = graphics.file_name_conflict_resolution.label;
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

  onRdpClientConfigChange() {
    this.setRdpClientConfig();
    this.onSettingChange('graphics', 'rdp_client_option', this.setting.graphics.rdp_client_option);
  }

  onMainThemeChange(theme: string) {
    useTheme().switchTheme(theme);
    this._iframeSvc.sendMessage({
      name: 'CHANGE_MAIN_THEME',
      data: theme
    });
    this.onSettingChange('basic', 'themes', theme);
  }

  onCharacterTerminalFontSizeChange(fontSize: number | null) {
    if (fontSize === null || fontSize === undefined) {
      return;
    }
    this.onSettingChange('command_line', 'character_terminal_font_size', fontSize);
  }

  onSettingChange(group: string, field: string, value: any) {
    this.pendingChanges[group] = {
      ...this.pendingChanges[group],
      [field]: _.cloneDeep(value)
    };
    void this.flushSaveQueue();
  }

  private async flushSaveQueue() {
    if (this.saveInProgress) {
      return;
    }

    this.saveInProgress = true;
    try {
      while (Object.keys(this.pendingChanges).length > 0) {
        const changes = this.pendingChanges;
        this.pendingChanges = {};
        try {
          await this.settingSrv.save(changes);
        } catch (error) {
          this.pendingChanges = this.mergeChanges(changes, this.pendingChanges);
          console.error('Failed to save Luna preferences:', error);
          this._message.error(this._i18n.instant('Failed'));
          return;
        }
      }
    } finally {
      this.saveInProgress = false;
    }
  }

  private mergeChanges(
    original: Record<string, Record<string, any>>,
    latest: Record<string, Record<string, any>>
  ) {
    const merged = _.cloneDeep(original);
    for (const [group, fields] of Object.entries(latest)) {
      merged[group] = {
        ...merged[group],
        ..._.cloneDeep(fields)
      };
    }
    return merged;
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
    this.onSettingChange('command_line', 'terminal_theme_name', theme);
  }

  changeTheme(theme: string) {
    this._iframeSvc.sendMessage({ name: 'TERMINAL_THEME_CHANGE', theme });
  }
}
