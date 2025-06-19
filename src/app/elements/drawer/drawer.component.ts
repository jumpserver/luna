import _ from 'lodash-es';

import { View } from '@app/model';
import { Subscription } from 'rxjs';
import { IframeCommunicationService, DrawerStateService } from '@app/services';
import { Component, OnInit, Input, effect, signal, OnDestroy, ViewChild } from '@angular/core';
import { ElementFileManagerComponent } from './filemanager/filemanager.component';

import type { OnlineUsers } from '@app/model';

interface DrawerViewState {
  onLineUsers: OnlineUsers[];
  isVisible: boolean;
  isChatOpen: boolean;
  isDrawerOpen: boolean;
  isSettingOpen: boolean;
  currentTabIndex: number;
  terminalContent: {} | null;
  disabledFileManager: boolean;
  disabledShortcutKeys: boolean;
}

@Component({
  standalone: false,
  selector: 'elements-drawer',
  templateUrl: 'drawer.component.html',
  styleUrls: ['drawer.component.scss']
})
export class ElementDrawerComponent implements OnInit, OnDestroy {
  @Input() view: View;
  @ViewChild('fileManagerComponent') fileManagerComponent: ElementFileManagerComponent;

  readonly showChat = signal(false);
  readonly showDrawer = signal(false);
  readonly showSetting = signal(false);
  readonly hasConnected = signal(false);
  readonly visible = signal(false);

  drawerInited = false;
  disabledFileManager = false;
  disabledShortcutKeys = false;

  currentTabIndex = 0;
  currentViewId: string | null = null;
  onLineUsers: OnlineUsers[] = [];
  chatIframeURL = '';
  terminalContent: {} | null = null;

  private readonly DISABLED_CATEGORIES = ['database', 'web'];
  private readonly DISABLED_ASSET_TYPES = ['windows', 'website'];
  private readonly DISABLED_PROTOCOLS = ['telnet'];

  private readonly drawerStateMap = new Map<string, DrawerViewState>();

  private isDisabledCategory(view: View): boolean {
    if (!view || !view.asset) {
      return false;
    }

    // 检查资产类别是否被禁用
    if (view.asset.category && this.DISABLED_CATEGORIES.includes(view.asset.category.value)) {
      return true;
    }

    // 检查资产类型是否被禁用
    if (view.asset.type && this.DISABLED_ASSET_TYPES.includes(view.asset.type.value)) {
      return true;
    }

    // 检查协议是否被禁用
    if (view.protocol && this.DISABLED_PROTOCOLS.includes(view.protocol)) {
      return true;
    }

    return false;
  }
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
      if (this.visible()) {
        this.checkConnectionStatus();
      }

      if (this.hasConnected()) {
        if (this.view && this.isDisabledCategory(this.view)) {
          this.disabledFileManager = true;
          this.disabledShortcutKeys = true;
          this.currentTabIndex = 1;
        }
      }
    });
  }

  private checkConnectionStatus(): void {
    const isConnected = Boolean(this.view?.iframeElement);

    if (isConnected) {
      this.hasConnected.set(true);

      return;
    }
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
      SSH_CLOSE: this.handleSshClose.bind(this),
      OPEN_CHAT: this.handleOpenChat.bind(this),
      OPEN_SETTING: this.handleOpenSetting.bind(this),

      DRAWER_RECONNECT: this.handleDrawerReconnect.bind(this),
      TAB_VIEW_CHANGE: this.handleTabViewChange.bind(this),
      ALL_VIEWS_CLOSED: this.handleAllViewsClosed.bind(this),
      TERMINAL_CONTENT_RESPONSE: this.handleTerminalContentResponse.bind(this)
    };

    const handler = messageHandlers[message.name];
    if (handler) {
      // 对于OPEN_SETTING消息，需要传递完整的data对象
      if (message.name === 'OPEN_SETTING') {
        handler(message.data);
      } else {
        handler(message.data);
      }
    }
  }

  private handleDrawerReconnect(): void {
    // 通知 filemanager 重新创建
    this.fileManagerComponent.reconnect();

    // 清理当前 viewId 下对应的 onlineUsers
    this.onLineUsers = [];
    this.saveCurrentViewState();
  }

  private handleSshClose(currentView: View): void {
    const currentViewId = currentView.id;

    if (this.drawerStateMap.has(currentViewId)) {
      if (this.currentViewId === currentViewId) {
        this.onLineUsers = [];
        this.visible.set(false);
      }

      if (this.fileManagerComponent) {
        this.fileManagerComponent.destroyIframeByViewId(currentViewId);
      }

      this.drawerStateMap.delete(currentViewId);

      console.log(`SSH 连接已关闭，视图 ${currentViewId} 的状态已清理`);
    }

    if (this.currentViewId === currentViewId) {
      this.saveCurrentViewState();
    }
  }

  private handleAllViewsClosed(): void {
    this.resetDrawerState();
    this.visible.set(false);
  }

  private handleTabViewChange(viewId: string): void {
    if (viewId === this.currentViewId) return;

    // 保存当前视图的状态（包括当前的 tab 索引）
    this.saveCurrentViewState();

    // 恢复新视图的状态（包括它最后激活时的 tab 索引）
    this.restoreViewState(viewId);

    this.currentViewId = viewId;
  }

  private handleOpenSetting(data?: any): void {
    this.drawerInited = true;
    this.showSetting.set(true);

    // 启用 filemanager 的逻辑执行
    if (this.fileManagerComponent) {
      // 如果有direct模式的数据，传递给filemanager
      if (data && data.direct && data.fileManagerToken) {
        this.fileManagerComponent.enableFileManagerLogic(data.fileManagerToken, true);
      } else {
        this.fileManagerComponent.enableFileManagerLogic();
      }
    }

    const viewId = this.view?.id || null;

    if (viewId) {
      if (this.currentViewId && this.currentViewId !== viewId) {
        this.saveCurrentViewState();
      }

      this.currentViewId = viewId;
      this.restoreViewState(viewId);
    } else {
      this.currentTabIndex = 0;
    }

    this.visible.set(true);
  }

  private handleOpenChat(chatIframeURL: string): void {
    this.chatIframeURL = chatIframeURL;
    this.showChat.set(true);
    this.showDrawer.set(true);
    this.saveCurrentViewState();
  }

  private handleTerminalContentResponse(data: string): void {
    this.terminalContent = data;
    this.saveCurrentViewState();
  }

  private restoreViewState(viewId: string): void {
    if (this.drawerStateMap.has(viewId)) {
      const savedState = this.drawerStateMap.get(viewId)!;

      this.visible.set(savedState.isVisible);
      this.showChat.set(savedState.isChatOpen);
      this.showDrawer.set(savedState.isDrawerOpen);
      this.showSetting.set(savedState.isSettingOpen);
      this.onLineUsers = [...savedState.onLineUsers];
      this.terminalContent = savedState.terminalContent || null;
      this.currentTabIndex = savedState.currentTabIndex;
      this.disabledFileManager = savedState.disabledFileManager;
      this.disabledShortcutKeys = savedState.disabledShortcutKeys;
    } else {
      this.initializeNewTabState(viewId);
    }
  }

  private createDefaultViewState(): DrawerViewState {
    return {
      isVisible: false,
      isChatOpen: false,
      isDrawerOpen: false,
      isSettingOpen: false,
      currentTabIndex: 0,
      terminalContent: null,
      onLineUsers: [],
      disabledFileManager: false,
      disabledShortcutKeys: false
    };
  }

  close(): void {
    this.visible.set(false);
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
        currentTabIndex: this.currentTabIndex,
        isVisible: this.visible(),
        disabledFileManager: this.disabledFileManager,
        disabledShortcutKeys: this.disabledShortcutKeys
      });
    }
  }

  initializeNewTabState(viewId: string): void {
    const defaultState = this.createDefaultViewState();

    // 根据资产类型设置禁用状态
    if (this.view && this.isDisabledCategory(this.view)) {
      defaultState.disabledFileManager = true;
      defaultState.disabledShortcutKeys = true;
      defaultState.currentTabIndex = 1;
    }

    this.onLineUsers = [];
    this.currentTabIndex = defaultState.currentTabIndex;
    this.showDrawer.set(false);
    this.showSetting.set(false);
    this.showChat.set(false);
    this.visible.set(false);
    this.disabledFileManager = defaultState.disabledFileManager;
    this.disabledShortcutKeys = defaultState.disabledShortcutKeys;

    this.drawerStateMap.set(viewId, defaultState);
  }

  onLineUsersAdd(data: OnlineUsers): void {
    // 只有在有 currentViewId 的情况下才添加用户
    if (this.currentViewId) {
      this.onLineUsers = [...this.onLineUsers, data];
      this.saveCurrentViewState();
    }
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
