import _ from 'lodash-es';
import xtermTheme from 'xterm-theme';
import { Setting, View } from '@app/model';
import { writeText } from 'clipboard-polyfill';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IframeCommunicationService } from '@app/services';
import { DrawerStateService } from '@src/app/services/drawer';
import { Component, OnInit, input, output, Input, effect, signal, OnDestroy } from '@angular/core';
import { LogService, SettingService, HttpService, I18nService } from '@app/services';

interface terminalThemeMap {
  label: string;
  value: string;
}

interface OnlineUsers {
  user: string;
  user_id: string;
  terminal_id: string;
  primary: boolean;
  writable: boolean;
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
export class ElementDrawerComponent implements OnInit, OnDestroy {
  @Input() view: View;
  visibleChange = output<boolean>();
  visible = input<boolean>(false);

  setting: Setting = new Setting();

  loading = false;
  showLinkResult = false;
  isDriverRedirect = false;
  showCreateShareLinkForm = true;
  showCreateShareLinkModal = false;
  hasConnected = signal(false);
  shareLink = '';
  shareCode = '';
  currentTheme = '';
  currentRdpScreenOptions = '';
  avatarUrl = '/static/img/avatar/admin.png';
  rdpScreenOptions = [];
  searchedUserList = [];
  shareExpiredOptions = [];
  shareUserPermissions = [];
  shareLinkRequest = {
    expired_time: 10,
    action_permission: 'writable',
    users: [] as ShareUserOptions[]
  };
  onLineUsers: OnlineUsers[] = [];

  shareLinkForm: FormGroup;

  iframeURL = '';

  terminalThemeMap: terminalThemeMap[] = [];

  constructor(
    private _fb: FormBuilder,
    private _http: HttpService,
    private _i18n: I18nService,
    private _logger: LogService,
    private _message: NzMessageService,
    private _settingSrv: SettingService,
    private _iframeCommunicationService: IframeCommunicationService,
    private _drawerStateService: DrawerStateService
  ) {
    this.sideEffect();
    this.initShareOptions();
    this.initShareLinkForm();
    this.subscriptonIframaMessage();
    this.loadSavedState();
  }
  ngOnDestroy(): void {
    this.saveCurrentState();
  }

  loadSavedState(): void {
    const savedState = this._drawerStateService.getState();

    this.onLineUsers = savedState.onLineUsers;
    this.iframeURL = savedState.iframeURL;
  }

  saveCurrentState(): void {
    this._drawerStateService.updateState({
      onLineUsers: this.onLineUsers,
      iframeURL: this.iframeURL,
    });
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
    this.saveCurrentState();
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
    this._http.getTerminalPreference().subscribe(res => {
      if (res) {
        this.currentTheme = res.basic.terminal_theme_name;
      }
    });
  }

  subscriptonIframaMessage() {
    this._iframeCommunicationService.message$.subscribe(message => {
      if (message.name === 'SHARE_CODE_RESPONSE') {
        const messageData = JSON.parse(message.data);
        this.shareCode = messageData.code;

        switch (this.view.connectMethod.component) {
          case 'koko':
            this.shareLink = `${this.view.smartEndpoint.getUrl()}/luna/share/${messageData.share_id}`;
            console.log(this.shareLink);
            break;
          case 'lion':
            this.shareLink = `${this.view.smartEndpoint.getUrl()}/luna/share/${messageData.share_id}?type=lion`;
            break;
          default:
            break;
        }

        this.showCreateShareLinkForm = false;
        this.showLinkResult = true;
      }

      if (message.name === 'SHARE_USER_ADD') {
        const messageData: OnlineUsers = JSON.parse(message.data);
        console.log(messageData);

        this.onLineUsers.push({
          user: messageData.user,
          user_id: messageData.user_id,
          terminal_id: messageData.terminal_id,
          primary: messageData.primary,
          writable: messageData.writable
        });
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
        .createConnectToken(this.view.asset, this.view.connectData, false, false, '')
        .subscribe(resp => {
          const token = resp ? resp.id : '';

          resolve(token);
        });
    });
  }

  checkIframeElement() {
    if (this.view?.iframeElement) {
      this.hasConnected.set(true);
      console.log('iframe 元素存在，已连接');
    } else {
      this.hasConnected.set(false);
      console.log('iframe 元素不存在，未连接');
    }
  }

  onThemeChange(theme: string) {
    this._iframeCommunicationService.sendMessage({ name: 'TERMINAL_THEME_CHANGE', theme });
    this._http.setTerminalPreference({ basic: { terminal_theme_name: theme } }).subscribe(res => {
      this._message.success(this._i18n.instant('主题同步成功'));
    });
  }

  initShareLinkForm() {
    this.shareLinkForm = this._fb.group({
      expired_time: [this.shareLinkRequest.expired_time],
      action_permission: [this.shareLinkRequest.action_permission],
      users: [this.shareLinkRequest.users]
    });
  }

  copyLink(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const linkTitle = this._i18n.instant('LinkAddr');
    const codeTitle = this._i18n.instant('VerifyCode');

    const text = `${linkTitle}: ${this.shareLink}\n${codeTitle}: ${this.shareCode}`;

    writeText(text);

    this._message.success(this._i18n.instant('Copied'));
    this.showLinkResult = false;
    this.showCreateShareLinkForm = true;
    this.showCreateShareLinkModal = false;
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

  onDeleteShareUser(item: OnlineUsers) {
    this._iframeCommunicationService.sendMessage({
      name: 'SHARE_USER_REMOVE',
      data: { ...item }
    });

    this.onLineUsers = this.onLineUsers.filter(user => {
      // 如果是要删除的用户，需要同时匹配 terminal_id 和 primary 状态
      if (user.terminal_id === item.terminal_id && user.primary === item.primary) {
        return false;
      }
      return true;
    });
  }

  handleCancel() {
    this.showCreateShareLinkModal = false;
    this.shareLinkForm.reset();
  }

  handleOk() {
    if (this.shareLinkForm.valid) {
      this.shareLinkRequest = { ...this.shareLinkRequest, ...this.shareLinkForm.value };

      this.showCreateShareLinkForm = false;

      this._iframeCommunicationService.sendMessage({
        name: 'SHARE_CODE_REQUEST',
        data: {
          users: this.shareLinkRequest.users,
          expired_time: this.shareLinkRequest.expired_time,
          action_permission: this.shareLinkRequest.action_permission
        }
      });

      this.showLinkResult = true;
    } else {
      Object.values(this.shareLinkForm.controls).forEach(control => {
        control.markAsTouched();
      });
    }
  }

  async onTabChange(event: { index: number; tab: any }) {
    const index = event.index;

    try {
      const { smartEndpoint, iframeElement } = this.view;

      if (index === 1 && iframeElement && !this.iframeURL) {
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
