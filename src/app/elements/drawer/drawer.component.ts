import _ from 'lodash-es';

import { View } from '@app/model';
import { Subscription } from 'rxjs';
import { IframeCommunicationService, DrawerStateService } from '@app/services';
import { Component, OnInit, Input, effect, signal, OnDestroy } from '@angular/core';

import type { OnlineUsers } from '@app/model';

interface DrawerViewState {
  onLineUsers: OnlineUsers[];
  isDrawerOpen: boolean;
  isSettingOpen: boolean;
  isChatOpen: boolean;
  terminalContent: {} | null;
  currentTabIndex: number;
}

@Component({
  standalone: false,
  selector: 'elements-drawer',
  templateUrl: 'drawer.component.html',
  styleUrls: ['drawer.component.scss']
})
export class ElementDrawerComponent implements OnInit, OnDestroy {
  @Input() view: View;

  readonly showChat = signal(false);
  readonly showDrawer = signal(false);
  readonly showSetting = signal(false);
  readonly hasConnected = signal(false);

  drawerInited = false;
  visible = false;

  currentTabIndex = 0;
  currentViewId: string | null = null;
  onLineUsers: OnlineUsers[] = [];
  chatIframeURL = '';
  terminalContent: {} | null = null;

  private readonly drawerStateMap = new Map<string, DrawerViewState>();
  private iframeMessageSubscription: Subscription;
  private componentsMessageSubscription: Subscription;

  constructor(
    private readonly _drawerStateService: DrawerStateService,
    private readonly _iframeSvc: IframeCommunicationService
  ) {
    this.initializeComponent();
  }

  ngOnInit(): void {
    this.drawerInited = true;
    this.resetDrawerState();
  }

  ngOnDestroy(): void {
    this.iframeMessageSubscription?.unsubscribe();
    this.componentsMessageSubscription?.unsubscribe();
  }

  private initializeComponent(): void {
    this.setupSideEffects();
    this.subscribeMessages();
  }

  private resetDrawerState(): void {
    this.showDrawer.set(false);
    this.showSetting.set(false);
    this.showChat.set(false);
  }

  private setupSideEffects(): void {
    effect(() => {
      if (this.visible) {
        this.checkConnectionStatus();
      }
    });
  }

  private checkConnectionStatus(): void {
    const isConnected = Boolean(this.view?.iframeElement);
    this.hasConnected.set(isConnected);
  }

  private subscribeMessages(): void {
    this.iframeMessageSubscription = this._iframeSvc.message$.subscribe(message => {
      this.handleIframeMessage(message);
    });
    this.componentsMessageSubscription = this._drawerStateService.message$.subscribe(message => {
      this.handleIframeMessage(message);
    });
  }

  private handleIframeMessage(message: any): void {
    const messageHandlers = {
      // 从组件中传递的
      OPEN_CHAT: this.handleOpenChat.bind(this),
      OPEN_SETTING: this.handleOpenSetting.bind(this),

      TAB_VIEW_CHANGE: this.handleTabViewChange.bind(this),
      ALL_VIEWS_CLOSED: this.handleAllViewsClosed.bind(this),
      TERMINAL_CONTENT_RESPONSE: this.handleTerminalContentResponse.bind(this)
    };

    const handler = messageHandlers[message.name];
    if (handler) {
      handler(message.data);
    }
  }

  private handleAllViewsClosed(): void {
    this.resetDrawerState();
  }

  private handleTabViewChange(viewId: string): void {
    if (viewId === this.currentViewId) return;

    // 保存当前视图的状态（包括当前的 tab 索引）
    this.saveCurrentViewState();

    // 恢复新视图的状态（包括它最后激活时的 tab 索引）
    this.restoreViewState(viewId);

    this.currentViewId = viewId;
  }

  private handleOpenSetting(): void {
    this.drawerInited = true;
    this.showSetting.set(true);

    const viewId = this.view?.id || null;

    if (viewId) {
      this.currentViewId = viewId;
      this.restoreViewState(viewId);
    } else {
      this.currentTabIndex = 0;
    }

    this.visible = true;
  }

  private handleOpenChat(chatIframeURL: string): void {
    this.chatIframeURL = chatIframeURL;
    this.showChat.set(true);
    this.showDrawer.set(true);
    this.saveCurrentViewState();
  }

  private handleTerminalContentResponse(data: string): void {
    // {content: string, sessionId: string, terminalId: string}
    this.terminalContent = data;
    this.saveCurrentViewState();
  }

  private restoreViewState(viewId: string): void {
    if (this.drawerStateMap.has(viewId)) {
      const savedState = this.drawerStateMap.get(viewId)!;
      this.onLineUsers = [...savedState.onLineUsers];
      this.showDrawer.set(savedState.isDrawerOpen);
      this.showSetting.set(savedState.isSettingOpen);
      this.showChat.set(savedState.isChatOpen);
      this.terminalContent = savedState.terminalContent || null;
      this.currentTabIndex = savedState.currentTabIndex;
    } else {
      this.initializeNewTabState(viewId);
    }
  }

  private createDefaultViewState(): DrawerViewState {
    return {
      onLineUsers: [],
      isDrawerOpen: false,
      isSettingOpen: false,
      isChatOpen: false,
      terminalContent: null,
      currentTabIndex: 0
    };
  }

  close(): void {
    this.visible = false;
  }

  onTabChange(event: { index: number; tab: any }): void {
    // 在切换 tab 之前保存当前状态
    this.saveCurrentViewState();

    this.currentTabIndex = event.index;

    if (event.index === 0) {
      this.currentViewId = this.view?.id || null;
    }

    // 切换后再次保存状态
    this.saveCurrentViewState();
  }

  saveCurrentViewState(): void {
    if (this.currentViewId) {
      this.drawerStateMap.set(this.currentViewId, {
        onLineUsers: [...this.onLineUsers],
        isDrawerOpen: this.showDrawer(),
        isSettingOpen: this.showSetting(),
        isChatOpen: this.showChat(),
        terminalContent: this.terminalContent || null,
        currentTabIndex: this.currentTabIndex
      });
    }
  }

  initializeNewTabState(viewId: string): void {
    const defaultState = this.createDefaultViewState();

    this.onLineUsers = [];
    this.currentTabIndex = 0;
    this.showDrawer.set(false);
    this.showSetting.set(false);
    this.showChat.set(false);

    this.drawerStateMap.set(viewId, defaultState);
  }

  onLineUsersAdd(data: OnlineUsers[]): void {
    this.onLineUsers = [...this.onLineUsers, ...data];
    this.saveCurrentViewState();
  }

  onDeleteShareUser(item: OnlineUsers): void {
    this._iframeSvc.sendMessage({
      name: 'SHARE_USER_REMOVE',
      data: item
    });

    if (this.currentViewId && this.view?.id === this.currentViewId) {
      this.onLineUsers = this.onLineUsers.filter(
        user => !(user.terminal_id === item.terminal_id && user.primary === item.primary)
      );
      this.saveCurrentViewState();
    }
  }
}
