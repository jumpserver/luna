import _ from 'lodash-es';

import { Setting, View } from '@app/model';
import { writeText } from 'clipboard-polyfill';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IframeCommunicationService } from '@app/services';
import { LogService, SettingService, HttpService, I18nService } from '@app/services';
import {
  Component,
  OnInit,
  Input,
  effect,
  signal,
  OnDestroy,
  ViewChild,
  ElementRef,
  Renderer2
} from '@angular/core';
import { Subscription } from 'rxjs';

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
  @ViewChild('iframeContainer') iframeContainer: ElementRef;

  setting: Setting = new Setting();

  showChat = signal(false);
  showDrawer = signal(false);
  showSetting = signal(false);
  iframeLoading = signal(false);

  loading = false;
  showLinkResult = false;
  showCreateShareLinkForm = true;
  showCreateShareLinkModal = false;
  hasConnected = signal(false);
  shareLink = '';
  shareCode = '';
  chatIframeURL = '';
  currentRdpScreenOptions = '';
  avatarUrl = '/static/img/avatar/admin.png';
  currentTabIndex = 0;
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
  private iframeCache = new Map<string, HTMLIFrameElement>();

  drawerStateMap = new Map<string, any>();
  messageSubscription: Subscription;
  currentViewId: string | null = null;

  constructor(
    private _fb: FormBuilder,
    private _http: HttpService,
    private _i18n: I18nService,
    private _logger: LogService,
    private _message: NzMessageService,
    private _settingSrv: SettingService,
    private _iframeCommunicationService: IframeCommunicationService,
    private renderer: Renderer2
  ) {
    this.sideEffect();
    this.initShareOptions();
    this.initShareLinkForm();
    this.subscriptonIframaMessage();
    this.showDrawer.set(false);
    this.showSetting.set(false);
  }

  ngOnDestroy(): void {
    this.messageSubscription.unsubscribe();
  }

  async ngOnInit(): Promise<void> {
    this.setting = this._settingSrv.setting;
    this.showChat.set(false);
    this.showDrawer.set(false);
    this.showSetting.set(false);
  }

  sideEffect() {
    effect(() => {
      if (this.showDrawer()) {
        this.checkIframeElement();
        if (this.showSetting() && this.currentTabIndex === 0) {
          setTimeout(() => this.handleFileManagerTab(), 0);
        }
      } else {
        this.hideAllIframes();
      }
    });
  }

  hasLicense() {
    return this._settingSrv.globalSetting.XPACK_LICENSE_IS_VALID;
  }

  close() {
    this.showDrawer.set(false);
    this.showSetting.set(false);
    this.showChat.set(false);
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

  subscriptonIframaMessage() {
    this.messageSubscription = this._iframeCommunicationService.message$.subscribe(message => {
      if (message.name === 'SHARE_CODE_RESPONSE') {
        try {
          const messageData = JSON.parse(message.data);
          console.log('SHARE_CODE_RESPONSE', messageData);
          this.shareCode = messageData.code;

          switch (this.view.connectMethod.component) {
            case 'koko':
              this.shareLink = `${this.view.smartEndpoint.getUrl()}/luna/share/${messageData.share_id}`;
              break;
            case 'lion':
              this.shareLink = `${this.view.smartEndpoint.getUrl()}/luna/share/${messageData.share_id}?type=lion`;
              break;
            default:
              break;
          }

          this.showCreateShareLinkForm = false;
          this.showLinkResult = true;
        } catch (error) {
          console.error('Failed to parse SHARE_CODE_RESPONSE:', error);
        }
      }

      if (message.name === 'SHARE_USER_ADD') {
        try {
          const messageData: OnlineUsers = JSON.parse(message.data);

          this.onLineUsers.push({
            user: messageData.user,
            user_id: messageData.user_id,
            terminal_id: messageData.terminal_id,
            primary: messageData.primary,
            writable: messageData.writable
          });

          this.saveCurrentViewState();
        } catch (error) {
          console.error('Failed to parse SHARE_USER_ADD:', error);
        }
      }

      if (message.name === 'TAB_VIEW_CHANGE') {
        const viewId = message.data;
        if (viewId === this.currentViewId) return;

        this.saveCurrentViewState();

        if (this.drawerStateMap.has(viewId)) {
          const savedState = this.drawerStateMap.get(viewId);
          this.onLineUsers = [...(savedState.onLineUsers || [])];
        } else {
          this.initializeNewTabState(viewId);
        }

        this.currentViewId = viewId;

        if (this.showDrawer() && this.currentTabIndex === 0) {
          this.handleFileManagerTab();
        }
      }

      if (message.name === 'OPEN_SETTING') {
        this.showDrawer.set(true);
        this.showSetting.set(true);
      }

      if (message.name === 'OPEN_CHAT') {
        this.chatIframeURL = message.data;
        this.showChat.set(true);
        this.showDrawer.set(true);
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
        .subscribe({
          next: resp => {
            const token = resp ? resp.id : '';
            resolve(token);
          },
          error: error => {
            console.error('Failed to get SFTP token:', error);
            reject(error);
          }
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

  initShareLinkForm() {
    this.shareLinkForm = this._fb.group({
      expired_time: [this.shareLinkRequest.expired_time],
      action_permission: [this.shareLinkRequest.action_permission],
      users: [this.shareLinkRequest.users]
    });
  }

  resetShareLinkModal() {
    // 重置显示状态
    this.showLinkResult = false;
    this.showCreateShareLinkForm = true;
    this.showCreateShareLinkModal = false;

    // 清空链接和分享码
    this.shareLink = '';
    this.shareCode = '';

    // 清空搜索相关状态
    this.searchedUserList = [];
    this.loading = false;

    // 重置表单
    this.shareLinkForm.reset();
    this.shareLinkForm.patchValue({
      expired_time: this.shareLinkRequest.expired_time,
      action_permission: this.shareLinkRequest.action_permission,
      users: []
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
    this.resetShareLinkModal();
  }

  onShareUserSearch(value: string) {
    this.loading = true;
    this._http.getShareUserList(value).subscribe({
      next: res => {
        if (res) {
          this.searchedUserList = res;
        }
        this.loading = false;
      },
      error: error => {
        console.error('Failed to search users:', error);
        this.loading = false;
        this.searchedUserList = [];
      }
    });
  }

  onCreateShareLink() {
    this.resetShareLinkModal();
    this.showCreateShareLinkModal = true;
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

    // 保存当前状态到对应的 viewId
    this.saveCurrentViewState();
  }

  saveCurrentViewState(): void {
    if (this.currentViewId) {
      this.drawerStateMap.set(this.currentViewId, {
        onLineUsers: [...this.onLineUsers], // 深拷贝数组
        iframeURL: this.iframeURL
      });
    }
  }

  initializeNewTabState(viewId: string): void {
    this.onLineUsers = [];
    this.iframeURL = '';

    this.drawerStateMap.set(viewId, {
      onLineUsers: [],
      iframeURL: this.iframeURL
    });
  }

  handleCancel() {
    this.resetShareLinkModal();
  }

  handleOk() {
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
  }

  async onTabChange(event: { index: number; tab: any }) {
    const index = event.index;
    this.currentTabIndex = index;

    if (index === 0) {
      this.handleFileManagerTab();
    } else {
      this.hideAllIframes();
    }
  }

  private hideAllIframes() {
    this.iframeCache.forEach(iframe => {
      if (iframe.parentNode) {
        this.renderer.setStyle(iframe, 'display', 'none');
      }
    });
  }

  private async handleFileManagerTab() {
    if (!this.view || !this.hasConnected()) {
      return;
    }
    const viewId = this.view.id;
    this.currentViewId = viewId;

    this.hideAllIframes();

    if (this.iframeCache.has(viewId)) {
      const iframe = this.iframeCache.get(viewId);
      this.renderer.setStyle(iframe, 'display', 'block');
      if (this.iframeContainer?.nativeElement) {
        this.renderer.appendChild(this.iframeContainer.nativeElement, iframe);
      }
    } else {
      this.iframeLoading.set(true);
      try {
        const url = await this.getIframeURL();
        if (this.iframeContainer?.nativeElement) {
          const iframe = this.renderer.createElement('iframe');
          this.renderer.setAttribute(iframe, 'src', url);
          this.renderer.setAttribute(iframe, 'frameborder', '0');
          this.renderer.setStyle(iframe, 'width', '100%');
          this.renderer.setStyle(iframe, 'height', 'calc(100vh - 170px)');
          this.iframeCache.set(viewId, iframe);
          this.renderer.appendChild(this.iframeContainer.nativeElement, iframe);
        }
      } catch (e) {
        this._logger.error(`Failed to create iframe for ${viewId}`, e);
      } finally {
        this.iframeLoading.set(false);
      }
    }
  }

  debounceSearch = _.debounce((value: string) => {
    this.onShareUserSearch(value);
  }, 500);

  async getIframeURL(): Promise<string> {
    const token = await this.getSFTPToken();
    const url = `${this.view.smartEndpoint.getUrl()}/koko/sftp?token=${token}`;
    return url;
  }
}
