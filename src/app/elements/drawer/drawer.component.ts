import xtermTheme from 'xterm-theme';
import { Setting, View } from '@app/model';
import { Component, OnInit, input, output, Input } from '@angular/core';
import { LogService, SettingService, HttpService, I18nService } from '@app/services';

import type { NzTabComponent } from 'ng-zorro-antd/tabs';

interface terminalThemeMap {
  label: string;
  value: string;
}

interface ShareUsers {
  username: string;
  status: 'entered' | 'inviting' | 'me';
  avatar: string;
}

@Component({
  standalone: false,
  selector: 'elements-drawer',
  templateUrl: 'drawer.component.html',
  styleUrls: ['drawer.component.scss']
})
export class ElementDrawerComponent implements OnInit {
  @Input() view: View;
  visibleChange = output<boolean>();
  visible = input<boolean>(false);

  setting: Setting = new Setting();

  rdpScreenOptions = [];
  currentRdpScreenOptions = '';
  isDriverRedirect = false;

  iframeURL = '';

  terminalThemeMap: terminalThemeMap[] = [];
  list = [
    {
      name: {
        last: 'me'
      }
    }
  ]

  constructor(
    private _http: HttpService,
    private _i18n: I18nService,
    private _logger: LogService,
    private _settingSrv: SettingService
  ) {}

  async ngOnInit(): Promise<void> {
    this.generateTerminalThemeMap();

    this.setting = this._settingSrv.setting;
  }

  hasLicense() {
    return this._settingSrv.globalSetting.XPACK_LICENSE_IS_VALID;
  }

  close() {
    this.visibleChange.emit(false);
  }

  generateTerminalThemeMap() {
    this.terminalThemeMap = [
      { label: 'Default', value: 'Default' },
      ...Object.keys(xtermTheme).map(item => ({ label: item, value: item }))
    ];
  }

  onTabChange(index: number) {
    try {
      const { smartEndpoint, iframeElement } = this.view;

      if (index === 1 && iframeElement) {
        const url = smartEndpoint.getUrl();

        // TODO 拿到 sftp 的 token
        this.iframeURL = `${url}/koko/sftp?token=${this.view.connectToken.id}`;
        console.log('iframe URL:', this.iframeURL);
      }
    } catch (e) {
      this._logger.error('Failed to get setting options', e);
    }
  }
}
