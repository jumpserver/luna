import { Setting } from '@app/model';
import { Component, OnInit, input, output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LogService, SettingService, HttpService, I18nService } from '@app/services';
import { takeUntil } from 'rxjs/operators';
import { themeColors } from '../../../sass/theme/main';

interface Panel {
  name: string;

  type: 'command' | 'graphic' | 'tree';

  active: boolean;
}

@Component({
  standalone: false,
  selector: 'elements-drawer',
  templateUrl: 'drawer.component.html',
  styleUrls: ['drawer.component.scss']
})
export class ElementDrawerComponent implements OnInit {
  visibleChange = output<boolean>();
  visible = input<boolean>(false);
  validateForm!: FormGroup;

  rdpClientConfig = {
    full_screen: false,
    multi_screen: false,
    drives_redirect: false
  };
  resolutionsOptions: any[];
  rdpSmartSizeOptions: any[];
  colorQualityOptions: any[];
  keyboardLayoutOptions: any[];

  setting: Setting = new Setting();

  // 字体选项
  fontFamilies = [
    { label: 'Monaco', value: 'Monaco' },
    { label: 'Consolas', value: 'Consolas' },
    { label: 'Courier New', value: 'Courier New' },
    { label: 'Source Code Pro', value: 'Source Code Pro' }
  ];

  // 光标样式选项
  cursorStyles = [
    { label: '线条', value: 'line' },
    { label: '下划线', value: 'underline' },
    { label: '竖线', value: 'block' }
  ];

  rdpScreenOptions = [];
  currentRdpScreenOptions = '';

  readonly panels: Panel[] = [
    {
      active: true,
      name: '命令行配置',
      type: 'command'
    },
    {
      active: false,
      name: '图形化配置',
      type: 'graphic'
    },
    {
      active: false,
      name: '资产树加载',
      type: 'tree'
    }
  ];

  readonly nzBodyStyle = {
    borderRadius: '8px',
    backgroundColor: 'var(--el-assets-extend-bg-color)'
  };

  readonly customStyle = {
    background: '#f7f7f7',
    'border-radius': '4px',
    border: '0px'
  };

  constructor(
    private fb: FormBuilder,
    private _http: HttpService,
    private _i18n: I18nService,
    private _logger: LogService,
    private _settingSrv: SettingService
  ) {
    this.rdpScreenOptions = [
      { label: this._i18n.instant('Full screen'), value: 'full_screen' },
      { label: this._i18n.instant('Multi Screen'), value: 'multi_screen' }
    ];
  }

  async ngOnInit(): Promise<void> {
    await this.getSettingOptions();

    this.setting = this._settingSrv.setting;
    this.getRdpClientConfig();

    this.validateForm = this.fb.group({
      cursorBlink: [true],
      leftClickCopy: [true],
      rightClickPaste: [true],
      backspaceAsCtrlH: [true],
      cursorStyle: ['line'],
      fontFamily: ['Monaco'],
      fontSize: [14, [Validators.min(8), Validators.max(72)]]
    });
  }

  hasLicense() {
    return this._settingSrv.globalSetting.XPACK_LICENSE_IS_VALID;
  }

  async getSettingOptions() {
    const url = '/api/v1/users/preference/?category=luna';
    try {
      const res: any = await this._http.options(url).toPromise();

      const graphics = res.actions.GET.graphics.children;

      this.resolutionsOptions = graphics.rdp_resolution.choices;
      this.rdpSmartSizeOptions = graphics.rdp_smart_size.choices;
      this.colorQualityOptions = graphics.rdp_color_quality.choices;
      this.keyboardLayoutOptions = graphics.keyboard_layout.choices;
    } catch (error) {
      this._logger.error('Failed to get setting options', error);
    }
  }

  close() {
    this.visibleChange.emit(false);
  }

  getRdpClientConfig() {
    const rdpClientConfig = this.setting.graphics.rdp_client_option || [];

    this.rdpScreenOptions.forEach(item => {
      if (rdpClientConfig.includes(item.value)) {
        this.currentRdpScreenOptions = item.value;
      }
    });

    console.log('rdpClientConfig', this.rdpClientConfig);
  }

  onRdpOptionsChange(selectedOptions: string[]) {}
}
