import _ from 'lodash-es';
import xtermTheme from 'xterm-theme';
import { Setting, View } from '@app/model';
import { IframeCommunicationService } from '@app/services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Component, OnInit, input, output, Input, effect } from '@angular/core';
import { LogService, SettingService, HttpService, I18nService } from '@app/services';

interface terminalThemeMap {
  label: string;
  value: string;
}

interface ShareUsers {
  username: string;
  status: 'entered' | 'inviting' | 'me';
  avatar: string;
}

interface ShareUserOptions {
  id: string;
  name: string;
  username: string;
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

  loading = false;
  hasConnected = false;
  isDriverRedirect = false;
  showCreateShareLinkModal = false;
  shareLink = '';
  shareCode = '';
  currentRdpScreenOptions = '';
  rdpScreenOptions = [];
  searchedUserList = [];
  shareExpiredOptions = [];
  shareUserPermissions = [];
  shareLinkRequest = {
    expired_time: 10,
    action_permission: 'writable',
    users: [] as ShareUserOptions[]
  };

  shareLinkForm: FormGroup;

  iframeURL = '';

  terminalThemeMap: terminalThemeMap[] = [];
  list = [
    {
      name: {
        last: 'me'
      }
    }
  ];

  constructor(
    private _fb: FormBuilder,
    private _http: HttpService,
    private _i18n: I18nService,
    private _logger: LogService,
    private _settingSrv: SettingService,
    private _iframeCommunicationService: IframeCommunicationService
  ) {
    this.sideEffect();
    this.initShareOptions();
    this.initShareLinkForm();
    this.subscriptonIframaMessage();
  }

  async ngOnInit(): Promise<void> {
    this.generateTerminalThemeMap();

    this.setting = this._settingSrv.setting;
  }

  sideEffect() {
    effect(() => {
      const isVisible = this.visible();

      if (isVisible) {
        this.checkIframeElement();
      }
    });
  }

  hasLicense() {
    return this._settingSrv.globalSetting.XPACK_LICENSE_IS_VALID;
  }

  close() {
    this.visibleChange.emit(false);
  }

  initShareOptions() {
    this.shareUserPermissions = [
      { label: this._i18n.instant('Writable'), value: 'writable' },
      { label: this._i18n.instant('ReadOnly'), value: 'readonly' }
    ];
    this.shareExpiredOptions = [
      { label: this.getMinuteLabel(1), value: 1 },
      { label: this.getMinuteLabel(5), value: 5 },
      { label: this.getMinuteLabel(10), value: 10 },
      { label: this.getMinuteLabel(20), value: 20 },
      { label: this.getMinuteLabel(60), value: 60 }
    ];
  }

  generateTerminalThemeMap() {
    this.terminalThemeMap = [
      { label: 'Default', value: 'Default' },
      ...Object.keys(xtermTheme).map(item => ({ label: item, value: item }))
    ];
  }

  subscriptonIframaMessage() {
    this._iframeCommunicationService.message$.subscribe(message => {
      if (message.name === 'SHARE_CODE_RESPONSE') {
        const messageData = JSON.parse(message.data);
        this.shareCode = messageData.share_code;

        switch (this.view.connectMethod.component) {
          case 'koko':
            this.shareLink = `${this.view.smartEndpoint.getUrl()}/luna/koko/share/${messageData.share_id}`;
            console.log(this.shareLink);
            break;
          case 'lion':
            this.shareLink = `${this.view.smartEndpoint.getUrl()}/luna/lion/share/${messageData.share_id}`;
            break;
          default:
            break;
        }
      }
    });
  }

  getMinuteLabel(minute: number) {
    let minuteLabel = this._i18n.instant('Minute');

    if (minute > 1) {
      minuteLabel = this._i18n.instant('Minutes');
    }

    return `${minute} ${minuteLabel}`;
  }

  async getSFTPToken() {
    // TODO ACL
    return new Promise((resolve, reject) => {
      this._http
        .adminConnectToken(this.view.asset, this.view.connectData, false, false, '')
        .subscribe(resp => {
          const token = resp ? resp.id : '';
          console.log(token);

          resolve(token);
        });
    });
  }

  checkIframeElement() {
    if (this.view?.iframeElement) {
      this.hasConnected = true;
      console.log('iframe 元素存在，已连接');
    } else {
      this.hasConnected = false;
      console.log('iframe 元素不存在，未连接');
    }
  }

  onThemeChange(theme: string) {
    this._iframeCommunicationService.sendMessage({ name: 'TERMINAL_THEME_CHANGE', theme });
  }

  initShareLinkForm() {
    this.shareLinkForm = this._fb.group({
      expired_time: [this.shareLinkRequest.expired_time],
      action_permission: [this.shareLinkRequest.action_permission],
      users: [this.shareLinkRequest.users]
    });
  }

  onShareUserSearch(value: string) {
    this.loading = true;
    this._http.getShareUserList(value).subscribe(res => {
      if (res) {
        this.searchedUserList = res;
        this.loading = false;
      }
    });
  }

  onCreateShareLink() {
    this.showCreateShareLinkModal = true;
    this.shareLinkForm.patchValue({
      expired_time: this.shareLinkRequest.expired_time,
      action_permission: this.shareLinkRequest.action_permission,
      users: this.shareLinkRequest.users
    });
  }

  handleCancel() {
    this.showCreateShareLinkModal = false;
    this.shareLinkForm.reset();
  }

  handleOk() {
    if (this.shareLinkForm.valid) {
      this.shareLinkRequest = { ...this.shareLinkRequest, ...this.shareLinkForm.value };
      console.log('分享链接请求数据:', this.shareLinkRequest);

      this.showCreateShareLinkModal = false;

      this._iframeCommunicationService.sendMessage({
        name: 'SHARE_CODE_REQUEST',
        data: {
          users: this.shareLinkRequest.users,
          expired_time: this.shareLinkRequest.expired_time,
          action_permission: this.shareLinkRequest.action_permission
        }
      });
    } else {
      Object.values(this.shareLinkForm.controls).forEach(control => {
        control.markAsTouched();
      });
    }
  }

  async onTabChange(event: { index: number; tab: any }) {
    const index = event.index;
    console.log('Tab changed to index:', index);
    try {
      const { smartEndpoint, iframeElement } = this.view;

      if (index === 1 && iframeElement) {
        const url = smartEndpoint.getUrl();
        const token = await this.getSFTPToken();

        this.iframeURL = `${url}/koko/sftp?token=${token}`;
        console.log('iframe URL:', this.iframeURL);
      }
    } catch (e) {
      this._logger.error('Failed to get setting options', e);
    }
  }

  debounceSearch = _.debounce((value: string) => {
    this.onShareUserSearch(value);
  }, 500);
}
