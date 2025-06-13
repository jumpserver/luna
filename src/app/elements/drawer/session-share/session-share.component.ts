import _ from 'lodash-es';
import { Subscription } from 'rxjs';
import { writeText } from 'clipboard-polyfill';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Component, OnDestroy, OnInit, input, Output, EventEmitter } from '@angular/core';
import { I18nService, IframeCommunicationService, ViewService, HttpService } from '@app/services';

import type { OnlineUsers } from '@app/model';

interface ExpiredOption {
  label: string;
  value: number;
}

interface ShareUserOptions {
  id: string;
  name: string;
  username: string;
}

interface PermissionOption {
  label: string;
  value: 'writable' | 'readonly';
}

interface ShareLinkRequest {
  expired_time: number;
  action_permission: 'writable' | 'readonly';
  users: string[];
}

@Component({
  standalone: false,
  selector: 'elements-session-share',
  templateUrl: 'session-share.component.html',
  styleUrls: ['session-share.component.scss']
})
export class ElementSessionShareComponent implements OnInit, OnDestroy {
  currentViewId = input<string>('');
  hasConnected = input<boolean>(false);
  onLineUsers = input<OnlineUsers[]>([]);

  @Output() onLineUsersAdd = new EventEmitter<OnlineUsers>();
  @Output() onShareUserRemove = new EventEmitter<OnlineUsers>();

  private readonly DEFAULT_SHARE_REQUEST: ShareLinkRequest = {
    expired_time: 10,
    action_permission: 'writable',
    users: []
  };

  private iframeMessageSubscription: Subscription;

  shareLinkForm: FormGroup;
  shareExpiredOptions: ExpiredOption[] = [];
  shareUserPermissions: PermissionOption[] = [];
  shareLinkRequest: ShareLinkRequest = { ...this.DEFAULT_SHARE_REQUEST };

  loading = false;

  shareLink = '';
  shareCode = '';

  searchedUserList: ShareUserOptions[] = [];

  showLinkResult = false;
  showCreateShareLinkModal = false;
  showCreateShareLinkForm = true;

  constructor(
    private _i18n: I18nService,
    private readonly _fb: FormBuilder,
    private readonly _http: HttpService,
    private readonly _viewSvc: ViewService,
    private readonly _message: NzMessageService,
    private readonly _iframeSvc: IframeCommunicationService
  ) {}

  ngOnInit(): void {
    this.subscribeMessages();
    this.initializeShareOptions();
    this.initializeShareLinkForm();
  }
  ngOnDestroy(): void {
    console.log('FileManager destroy');
  }

  copyLink(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const linkTitle = this._i18n.instant('LinkAddr');
    const codeTitle = this._i18n.instant('VerifyCode');
    const text = `${linkTitle}: ${this.shareLink}\n${codeTitle}: ${this.shareCode}`;

    writeText(text);
    this._message.success(this._i18n.instant('Copied'));
    this.resetShareLinkModal();
  }

  handleCancel() {
    this.resetShareLinkModal();
  }

  onCreateShareLink() {
    const formValue = this.shareLinkForm.value;

    this.shareLinkRequest = {
      ...this.shareLinkRequest,
      expired_time: formValue.expired_time,
      action_permission: formValue.action_permission
    };

    this.showCreateShareLinkForm = false;

    this._iframeSvc.sendMessage({
      name: 'SHARE_CODE_REQUEST',
      data: this.shareLinkRequest
    });
  }

  onDeleteShareUser(item: OnlineUsers) {
    this._iframeSvc.sendMessage({
      name: 'SHARE_USER_REMOVE',
      data: item
    });

    if (this.currentViewId() && this._viewSvc.currentView?.id === this.currentViewId()) {
      this.onShareUserRemove.emit(item);
    }
  }

  onShowCreateShareLinkModal() {
    this.resetShareLinkModal();
    this.showCreateShareLinkModal = true;
  }

  private subscribeMessages() {
    this.iframeMessageSubscription = this._iframeSvc.message$.subscribe(message => {
      this.handleIframeMessage(message);
    });
  }

  private resetShareLinkModal() {
    this.showLinkResult = false;
    this.showCreateShareLinkForm = true;
    this.showCreateShareLinkModal = false;
    this.shareLink = '';
    this.shareCode = '';
    this.searchedUserList = [];

    this.shareLinkForm.reset();
    this.shareLinkForm.patchValue({
      expired_time: this.DEFAULT_SHARE_REQUEST.expired_time,
      action_permission: this.DEFAULT_SHARE_REQUEST.action_permission,
      users: []
    });
  }

  onShareUserSearch(value: string) {
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

  private initializeShareOptions() {
    this.shareUserPermissions = [
      { label: this._i18n.instant('Writable'), value: 'writable' },
      { label: this._i18n.instant('ReadOnly'), value: 'readonly' }
    ];

    this.shareExpiredOptions = [1, 5, 10, 20, 60].map(minutes => ({
      label: this.getMinuteLabel(minutes),
      value: minutes
    }));
  }

  private initializeShareLinkForm() {
    this.shareLinkForm = this._fb.group({
      expired_time: [this.shareLinkRequest.expired_time],
      action_permission: [this.shareLinkRequest.action_permission],
      users: [this.shareLinkRequest.users]
    });

    // 监听 users 控件值的变化
    this.shareLinkForm.get('users')?.valueChanges.subscribe(value => {
      this.handleUsersChange(value);
    });
  }

  private handleIframeMessage(message) {
    const messageHandlers = {
      SHARE_USER_ADD: this.handleShareUserAdd.bind(this),

      SHARE_USER_LEAVE: this.handleShareUserLeave.bind(this),
      SHARE_CODE_RESPONSE: this.handleShareCodeResponse.bind(this)
    };

    const handler = messageHandlers[message.name];
    if (handler) {
      handler(message.data);
    }
  }

  private getMinuteLabel(minute: number) {
    const minuteLabel = minute > 1 ? this._i18n.instant('Minutes') : this._i18n.instant('Minute');
    return `${minute} ${minuteLabel}`;
  }

  private handleShareUserAdd(data: string) {
    try {
      const messageData: OnlineUsers = JSON.parse(data);

      this.onLineUsersAdd.emit(messageData);
    } catch (error) {
      console.error('Failed to parse SHARE_USER_ADD:', error);
    }
  }

  private generateShareLink(shareId: string) {
    const baseUrl = this._viewSvc.currentView.smartEndpoint.getUrl();
    const componentType = this._viewSvc.currentView.connectMethod.component;

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

  private handleShareUserLeave(data: string) {
    const messageData: OnlineUsers = JSON.parse(data);

    if (this.currentViewId() && this._viewSvc.currentView?.id === this.currentViewId()) {
      this.onShareUserRemove.emit(messageData);
    }
  }

  private handleShareCodeResponse(data: string) {
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

  private handleUsersChange(users: ShareUserOptions[]) {
    this.shareLinkRequest.users = (users || []).map(user => user.id);
  }

  readonly debounceSearch = _.debounce((value: string) => {
    this.onShareUserSearch(value);
  }, 500);
}
