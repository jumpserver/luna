import _ from 'lodash-es';

import { Setting, View } from '@app/model';
import { writeText } from 'clipboard-polyfill';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IframeCommunicationService } from '@app/services';
import {
  LogService,
  SettingService,
  HttpService,
  I18nService,
  ConnectTokenService
} from '@app/services';
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

interface ShareLinkRequest {
  expired_time: number;
  action_permission: 'writable' | 'readonly';
  users: ShareUserOptions[];
}

interface DrawerViewState {
  onLineUsers: OnlineUsers[];
  iframeURL: string;
  isDrawerOpen: boolean;
  isSettingOpen: boolean;
  isChatOpen: boolean;
}

interface ExpiredOption {
  label: string;
  value: number;
}

interface PermissionOption {
  label: string;
  value: 'writable' | 'readonly';
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

  readonly showChat = signal(false);
  readonly showDrawer = signal(false);
  readonly showSetting = signal(false);
  readonly iframeLoading = signal(false);
  readonly hasConnected = signal(false);

  showLinkResult = false;
  showCreateShareLinkForm = true;
  showCreateShareLinkModal = false;
  loading = false;

  shareLink = '';
  shareCode = '';
  shareLinkForm: FormGroup;
  searchedUserList: ShareUserOptions[] = [];
  shareExpiredOptions: ExpiredOption[] = [];
  shareUserPermissions: PermissionOption[] = [];

  currentTabIndex = 0;
  currentViewId: string | null = null;
  onLineUsers: OnlineUsers[] = [];
  iframeURL = '';
  chatIframeURL = '';

  private readonly DEFAULT_SHARE_REQUEST: ShareLinkRequest = {
    expired_time: 10,
    action_permission: 'writable',
    users: []
  };

  private readonly drawerStateMap = new Map<string, DrawerViewState>();
  private messageSubscription: Subscription;
  private shareLinkRequest: ShareLinkRequest = { ...this.DEFAULT_SHARE_REQUEST };

  constructor(
    private readonly _fb: FormBuilder,
    private readonly _http: HttpService,
    private readonly _i18n: I18nService,
    private readonly renderer: Renderer2,
    private readonly _logger: LogService,
    private readonly _message: NzMessageService,
    private readonly _settingSrv: SettingService,
    private readonly _connectTokenSvc: ConnectTokenService,
    private readonly _iframeCommunicationService: IframeCommunicationService
  ) {
    this.initializeComponent();
  }

  ngOnInit(): void {
    this.resetDrawerState();
  }

  ngOnDestroy(): void {
    this.messageSubscription?.unsubscribe();
  }

  private initializeComponent(): void {
    this.setupSideEffects();
    this.initializeShareOptions();
    this.initializeShareLinkForm();
    this.subscribeToIframeMessages();
    this.resetDrawerState();
  }

  private resetDrawerState(): void {
    this.showDrawer.set(false);
    this.showSetting.set(false);
    this.showChat.set(false);
  }

  private setupSideEffects(): void {
    effect(() => {
      if (this.showDrawer()) {
        this.checkConnectionStatus();
        if (this.showSetting() && this.currentTabIndex === 0) {
          setTimeout(() => this.handleFileManagerTab(), 0);
        }
      } else {
        this.hideAllIframes();
      }
    });
  }

  private checkConnectionStatus(): void {
    const isConnected = Boolean(this.view?.iframeElement);
    this.hasConnected.set(isConnected);
  }

  private initializeShareOptions(): void {
    this.shareUserPermissions = [
      { label: this._i18n.instant('Writable'), value: 'writable' },
      { label: this._i18n.instant('ReadOnly'), value: 'readonly' }
    ];

    this.shareExpiredOptions = [1, 5, 10, 20, 60].map(minutes => ({
      label: this.getMinuteLabel(minutes),
      value: minutes
    }));
  }

  private initializeShareLinkForm(): void {
    this.shareLinkForm = this._fb.group({
      expired_time: [this.shareLinkRequest.expired_time],
      action_permission: [this.shareLinkRequest.action_permission],
      users: [this.shareLinkRequest.users]
    });
  }

  private subscribeToIframeMessages(): void {
    this.messageSubscription = this._iframeCommunicationService.message$.subscribe(message => {
      this.handleIframeMessage(message);
    });
  }

  private handleIframeMessage(message: any): void {
    const messageHandlers = {
      SHARE_CODE_RESPONSE: this.handleShareCodeResponse.bind(this),
      SHARE_USER_ADD: this.handleShareUserAdd.bind(this),
      TAB_VIEW_CHANGE: this.handleTabViewChange.bind(this),
      OPEN_SETTING: this.handleOpenSetting.bind(this),
      OPEN_CHAT: this.handleOpenChat.bind(this)
    };

    const handler = messageHandlers[message.name];
    if (handler) {
      handler(message.data);
    }
  }

  private handleShareCodeResponse(data: string): void {
    try {
      const messageData = JSON.parse(data);
      this.shareCode = messageData.code;
      this.generateShareLink(messageData.share_id);
      this.showCreateShareLinkForm = false;
      this.showLinkResult = true;
    } catch (error) {
      console.error('Failed to parse SHARE_CODE_RESPONSE:', error);
    }
  }

  private generateShareLink(shareId: string): void {
    const baseUrl = this.view.smartEndpoint.getUrl();
    const componentType = this.view.connectMethod.component;

    switch (componentType) {
      case 'koko':
        this.shareLink = `${baseUrl}/luna/share/${shareId}`;
        break;
      case 'lion':
        this.shareLink = `${baseUrl}/luna/share/${shareId}?type=lion`;
        break;
      default:
        this.shareLink = `${baseUrl}/luna/share/${shareId}`;
        break;
    }
  }

  private handleShareUserAdd(data: string): void {
    try {
      const messageData: OnlineUsers = JSON.parse(data);
      this.onLineUsers.push(messageData);
      this.saveCurrentViewState();
    } catch (error) {
      console.error('Failed to parse SHARE_USER_ADD:', error);
    }
  }

  private handleTabViewChange(viewId: string): void {
    if (viewId === this.currentViewId) return;

    this.saveCurrentViewState();
    this.restoreViewState(viewId);
    this.currentViewId = viewId;

    if (this.showDrawer() && this.currentTabIndex === 0) {
      this.handleFileManagerTab();
    }
  }

  private handleOpenSetting(): void {
    this.showDrawer.set(true);
    this.showSetting.set(true);
    this.saveCurrentViewState();
  }

  private handleOpenChat(chatIframeURL: string): void {
    this.chatIframeURL = chatIframeURL;
    this.showChat.set(true);
    this.showDrawer.set(true);
    this.saveCurrentViewState();
  }

  private restoreViewState(viewId: string): void {
    if (this.drawerStateMap.has(viewId)) {
      const savedState = this.drawerStateMap.get(viewId)!;
      this.onLineUsers = [...savedState.onLineUsers];
      this.showDrawer.set(savedState.isDrawerOpen);
      this.showSetting.set(savedState.isSettingOpen);
      this.showChat.set(savedState.isChatOpen);
      this.iframeURL = savedState.iframeURL;
    } else {
      this.initializeNewTabState(viewId);
    }
  }

  private createDefaultViewState(): DrawerViewState {
    return {
      onLineUsers: [],
      iframeURL: '',
      isDrawerOpen: false,
      isSettingOpen: false,
      isChatOpen: false
    };
  }

  private getMinuteLabel(minute: number): string {
    const minuteLabel = minute > 1 ? this._i18n.instant('Minutes') : this._i18n.instant('Minute');
    return `${minute} ${minuteLabel}`;
  }

  private async getSFTPToken(): Promise<string | undefined> {
    const oldToken = this.view.connectToken;
    const newToken = await this._connectTokenSvc.exchange(oldToken);
    return newToken?.id;
  }

  private async getIframeURL(): Promise<string> {
    const token = await this.getSFTPToken();
    return `${this.view.smartEndpoint.getUrl()}/koko/sftp?token=${token}`;
  }

  private hideAllIframes(): void {
    if (this.iframeContainer?.nativeElement) {
      const iframe = this.iframeContainer.nativeElement.querySelector('iframe');
      if (iframe) {
        this.renderer.setStyle(iframe, 'display', 'none');
      }
    }
  }

  private async handleFileManagerTab(): Promise<void> {
    if (!this.view || !this.hasConnected()) {
      return;
    }

    const viewId = this.view.id;
    this.currentViewId = viewId;

    // 检查当前容器中是否已经有iframe（tab切换场景）
    const existingIframe = this.iframeContainer?.nativeElement?.querySelector('iframe');

    if (existingIframe) {
      return;
    }

    try {
      const url = await this.getIframeURL();
      this.createNewIframe(url, viewId);
    } catch (error) {
      this._logger.error(`Failed to get iframe URL for ${viewId}`, error);
    }
  }

  /**
   * 创建新的iframe
   */
  private createNewIframe(url: string, viewId: string): void {
    if (!this.iframeContainer?.nativeElement) {
      return;
    }

    const iframe = this.renderer.createElement('iframe');
    this.renderer.setAttribute(iframe, 'src', url);
    this.renderer.setAttribute(iframe, 'frameborder', '0');
    this.renderer.setAttribute(iframe, 'data-view-id', viewId);
    this.renderer.setStyle(iframe, 'width', '100%');
    this.renderer.setStyle(iframe, 'height', 'calc(100vh - 170px)');

    this.renderer.appendChild(this.iframeContainer.nativeElement, iframe);
  }

  // Public methods
  hasLicense(): boolean {
    return this._settingSrv.globalSetting.XPACK_LICENSE_IS_VALID;
  }

  close(): void {
    this.resetDrawerState();
    this.saveCurrentViewState();
  }

  async onTabChange(event: { index: number; tab: any }): Promise<void> {
    this.currentTabIndex = event.index;

    if (event.index === 0) {
      await this.handleFileManagerTab();
      this.showFileManagerIframe();
    } else {
      this.hideFileManagerIframe();
    }
  }

  onCreateShareLink(): void {
    this.resetShareLinkModal();
    this.showCreateShareLinkModal = true;
  }

  onDeleteShareUser(item: OnlineUsers): void {
    this._iframeCommunicationService.sendMessage({
      name: 'SHARE_USER_REMOVE',
      data: item
    });

    this.onLineUsers = this.onLineUsers.filter(
      user => !(user.terminal_id === item.terminal_id && user.primary === item.primary)
    );

    this.saveCurrentViewState();
  }

  onShareUserSearch(value: string): void {
    this.loading = true;
    this._http.getShareUserList(value).subscribe({
      next: res => {
        this.searchedUserList = res || [];
        this.loading = false;
      },
      error: error => {
        console.error('Failed to search users:', error);
        this.loading = false;
        this.searchedUserList = [];
      }
    });
  }

  copyLink(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const linkTitle = this._i18n.instant('LinkAddr');
    const codeTitle = this._i18n.instant('VerifyCode');
    const text = `${linkTitle}: ${this.shareLink}\n${codeTitle}: ${this.shareCode}`;

    writeText(text);
    this._message.success(this._i18n.instant('Copied'));
    this.resetShareLinkModal();
  }

  handleCancel(): void {
    this.resetShareLinkModal();
  }

  handleOk(): void {
    this.shareLinkRequest = { ...this.shareLinkRequest, ...this.shareLinkForm.value };
    this.showCreateShareLinkForm = false;

    this._iframeCommunicationService.sendMessage({
      name: 'SHARE_CODE_REQUEST',
      data: this.shareLinkRequest
    });

    this.showLinkResult = true;
  }

  saveCurrentViewState(): void {
    if (this.currentViewId) {
      this.drawerStateMap.set(this.currentViewId, {
        onLineUsers: [...this.onLineUsers],
        iframeURL: this.iframeURL,
        isDrawerOpen: this.showDrawer(),
        isSettingOpen: this.showSetting(),
        isChatOpen: this.showChat()
      });
    }
  }

  initializeNewTabState(viewId: string): void {
    const defaultState = this.createDefaultViewState();
    Object.assign(this, {
      onLineUsers: defaultState.onLineUsers,
      iframeURL: defaultState.iframeURL
    });

    this.showDrawer.set(defaultState.isDrawerOpen);
    this.showSetting.set(defaultState.isSettingOpen);
    this.showChat.set(defaultState.isChatOpen);

    this.drawerStateMap.set(viewId, defaultState);
  }

  // Debounced search method
  readonly debounceSearch = _.debounce((value: string) => {
    this.onShareUserSearch(value);
  }, 500);

  // Private methods
  private showFileManagerIframe(): void {
    if (this.iframeContainer?.nativeElement) {
      const iframe = this.iframeContainer.nativeElement.querySelector('iframe');
      if (iframe) {
        this.renderer.setStyle(iframe, 'display', 'block');
        this.renderer.setStyle(iframe, 'visibility', 'visible');
      }
    }
  }

  private hideFileManagerIframe(): void {
    if (this.iframeContainer?.nativeElement) {
      const iframe = this.iframeContainer.nativeElement.querySelector('iframe');
      if (iframe) {
        this.renderer.setStyle(iframe, 'display', 'none');
        this.renderer.setStyle(iframe, 'visibility', 'hidden');
      }
    }
  }

  private resetShareLinkModal(): void {
    this.showLinkResult = false;
    this.showCreateShareLinkForm = true;
    this.showCreateShareLinkModal = false;
    this.shareLink = '';
    this.shareCode = '';
    this.searchedUserList = [];
    this.loading = false;

    this.shareLinkForm.reset();
    this.shareLinkForm.patchValue({
      expired_time: this.DEFAULT_SHARE_REQUEST.expired_time,
      action_permission: this.DEFAULT_SHARE_REQUEST.action_permission,
      users: []
    });
  }
}
