import { View } from '@app/model';
import { ConnectTokenService } from '@app/services';
import {
  Component,
  OnDestroy,
  OnInit,
  AfterViewInit,
  input,
  ViewChild,
  ElementRef,
  Renderer2,
  effect
} from '@angular/core';
import { DrawerStateService } from '@app/services';
import { Subscription } from 'rxjs';

@Component({
  standalone: false,
  selector: 'elements-filemanager',
  templateUrl: 'filemanager.component.html',
  styleUrls: ['filemanager.component.scss']
})
export class ElementFileManagerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('iframeContainer') iframeContainer: ElementRef;

  view = input<View | null>(null);
  currentViewId = input<string>('');

  private viewInitialized = false;
  private viewIdOpenSettingStatus = new Map<string, boolean>();
  private iframes = new Map<string, HTMLIFrameElement>();
  private currentDisplayedViewId: string | null = null;
  private directTokens = new Map<string, string>();

  private readonly DISABLED_CATEGORIES = ['database', 'web'];
  private readonly DISABLED_ASSET_TYPES = ['windows', 'website'];
  private readonly DISABLED_PROTOCOLS = ['telnet'];

  private iframeMessageSubscription: Subscription;
  private drawerMessageSubscription: Subscription;
  private windowMessageListener: (event: MessageEvent) => void;

  private viewReconnectStates = new Map<
    string,
    {
      showReconnectButton: boolean;
      reconnectLoading: boolean;
      failed: boolean;
      loading: boolean;
      hasValidIframe: boolean;
    }
  >();

  // 计算属性：当前 viewId 的重连状态
  get showReconnectButton(): boolean {
    const currentViewId = this.currentViewId();
    return this.viewReconnectStates.get(currentViewId)?.showReconnectButton || false;
  }

  get reconnectLoading(): boolean {
    const currentViewId = this.currentViewId();
    return this.viewReconnectStates.get(currentViewId)?.reconnectLoading || false;
  }

  get showLoadingState(): boolean {
    const currentViewId = this.currentViewId();
    const state = this.viewReconnectStates.get(currentViewId);
    return state?.loading || false;
  }

  get shouldShowIframeContainer(): boolean {
    const currentViewId = this.currentViewId();
    const state = this.viewReconnectStates.get(currentViewId);
    // 只有当前viewId有有效iframe且不在重连状态时才显示iframe容器
    return !this.showReconnectButton && !this.showLoadingState && (state?.hasValidIframe || false);
  }

  private isDisabledCategory(): boolean {
    const view = this.view();
    if (!view || !view.asset) {
      return false;
    }

    // 检查资产类别是否被禁用
    if (view.asset.category && this.DISABLED_CATEGORIES.includes(view.asset.category.value)) {
      return true;
    }

    // Windows资产的特殊处理
    if (view.asset.type && view.asset.type.value === 'windows') {
      // Windows下的SSH不禁用文件管理器
      if (view.protocol === 'ssh') {
        return false;
      }
      // Windows下的其他协议（如RDP）禁用文件管理器
      return true;
    }

    // 检查其他资产类型是否被禁用
    if (view.asset.type && view.asset.type.value === 'website') {
      return true;
    }

    // 检查协议是否被禁用（文件管理器需要禁用telnet）
    if (view.protocol && this.DISABLED_PROTOCOLS.includes(view.protocol)) {
      return true;
    }

    return false;
  }

  private setReconnectState(
    viewId: string,
    state: Partial<{
      showReconnectButton: boolean;
      reconnectLoading: boolean;
      failed: boolean;
      loading: boolean;
      hasValidIframe: boolean;
    }>
  ) {
    const currentState = this.viewReconnectStates.get(viewId) || {
      showReconnectButton: false,
      reconnectLoading: false,
      failed: false,
      loading: false,
      hasValidIframe: false
    };
    this.viewReconnectStates.set(viewId, { ...currentState, ...state });
  }

  private getReconnectState(viewId: string) {
    return (
      this.viewReconnectStates.get(viewId) || {
        showReconnectButton: false,
        reconnectLoading: false,
        failed: false,
        loading: false,
        hasValidIframe: false
      }
    );
  }

  constructor(
    private readonly renderer: Renderer2,
    private readonly _connectTokenSvc: ConnectTokenService,
    private readonly _drawerStateService: DrawerStateService
  ) {
    effect(() => {
      const currentViewId = this.currentViewId();
      const view = this.view();

      if (!this.viewInitialized || !currentViewId || !view) {
        return;
      }

      // 检查是否为禁用的资产类型
      if (this.isDisabledCategory()) {
        return;
      }

      // 总是先切换视图显示状态（基于当前状态决定显示什么）
      this.switchToView(currentViewId);

      // 如果已经有 iframe，无需重新创建
      if (this.iframes.has(currentViewId)) {
        return;
      }

      // 检查当前 viewId 的状态
      const currentState = this.getReconnectState(currentViewId);

      // 如果已经处于失败状态，不要自动重试，让用户手动点击重连
      if (currentState.failed && currentState.showReconnectButton) {
        return;
      }

      // 如果没有 iframe 且已经收到 OpenSetting 信号，则创建
      const hasReceivedOpenSetting = this.viewIdOpenSettingStatus.get(currentViewId) || false;
      if (hasReceivedOpenSetting) {
        // 设置loading状态
        this.setReconnectState(currentViewId, { loading: true });

        this.createNewIframe(currentViewId, view)
          .then(() => {
            setTimeout(() => {
              this.switchToView(currentViewId);
            }, 100);
          })
          .catch(error => {
            console.error('创建 iframe 失败:', error);
            // 失败时，显示重连按钮的逻辑已经在 createNewIframe 中处理
          });
      } else {
        console.log(
          'Waiting for OpenSetting signal before creating iframe for viewId:',
          currentViewId
        );
      }
    });
  }

  ngOnInit(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.data && event.data.name === 'FILE_MANAGE_EXPIRED') {
        this.handleFileManageExpired(event.data.data || {});
      }
    });
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
  }

  ngOnDestroy(): void {
    this.iframes.clear();
    this.viewIdOpenSettingStatus.clear();
    this.viewReconnectStates.clear();
    this.directTokens.clear();
    this.iframeMessageSubscription?.unsubscribe();
    this.drawerMessageSubscription?.unsubscribe();
  }

  private handleFileManageExpired(data: any): void {
    // 获取当前 viewId，如果消息中有特定的 viewId 则使用消息中的，否则使用当前的
    const targetViewId = data?.viewId || this.currentViewId();

    if (targetViewId) {
      // 清理失败的 iframe
      this.cleanupFailedView(targetViewId);

      // 设置重连状态，显示重连按钮
      this.setReconnectState(targetViewId, {
        showReconnectButton: true,
        failed: true,
        reconnectLoading: false,
        loading: false,
        hasValidIframe: false
      });
    } else {
      console.warn('无法确定 targetViewId，无法处理 FILE_MANAGE_EXPIRED 消息');
    }
  }

  public enableFileManagerLogic(directToken?: string, isDirect?: boolean): void {
    const currentViewId = this.currentViewId();
    if (!currentViewId) {
      return;
    }

    if (this.isDisabledCategory()) {
      return;
    }

    // 为当前 viewId 标记已收到 OpenSetting 信号
    this.viewIdOpenSettingStatus.set(currentViewId, true);

    // 如果是direct模式且有token，存储token以供后续使用
    if (isDirect && directToken) {
      this.directTokens.set(currentViewId, directToken);
    }

    const view = this.view();

    if (this.viewInitialized && currentViewId && view && !this.iframes.has(currentViewId)) {
      const currentState = this.getReconnectState(currentViewId);

      // 如果已经处于失败状态，不要自动重试，让用户手动点击重连
      if (currentState.failed && currentState.showReconnectButton) {
        return;
      }

      this.setReconnectState(currentViewId, { loading: true });

      this.createNewIframe(currentViewId, view)
        .then(() => {
          setTimeout(() => {
            this.switchToView(currentViewId);
          }, 100);
        })
        .catch(error => {
          console.error('首次创建 iframe 失败:', error);
        });
    }
  }

  public destroyIframeByViewId(viewId: string): void {
    const iframe = this.iframes.get(viewId);

    if (iframe && this.iframeContainer?.nativeElement) {
      this.renderer.removeChild(this.iframeContainer.nativeElement, iframe);

      this.iframes.delete(viewId);
      // 同时清理对应的 OpenSetting 状态
      this.viewIdOpenSettingStatus.delete(viewId);

      if (this.currentDisplayedViewId === viewId) {
        this.currentDisplayedViewId = null;
      }
    }

    // 清理重连状态和direct token
    this.viewReconnectStates.delete(viewId);
    this.directTokens.delete(viewId);
  }

  // 添加重连方法
  public async reconnect(): Promise<void> {
    const currentViewId = this.currentViewId();
    const view = this.view();

    if (!currentViewId || !view || this.reconnectLoading) {
      return;
    }

    // 检查是否为禁用的资产类型
    if (this.isDisabledCategory()) {
      return;
    }

    // 额外检查：确认 currentViewId 与 view.id 是否一致
    if (view.id !== currentViewId) {
      console.warn('ViewId 不一致！', {
        inputCurrentViewId: currentViewId,
        viewObjectId: view.id
      });
    }

    this.setReconnectState(currentViewId, {
      reconnectLoading: true,
      loading: true,
      showReconnectButton: false
    });

    try {
      const actualViewId = view.id;

      this.cleanupFailedView(actualViewId);

      await this.createNewIframe(actualViewId, view);

      this.setReconnectState(actualViewId, {
        showReconnectButton: false,
        reconnectLoading: false,
        failed: false,
        loading: false,
        hasValidIframe: true
      });

      setTimeout(() => {
        this.switchToView(actualViewId);

        // 通知抽屉组件文件管理器已重连，需要刷新状态
        // 发送 TAB_VIEW_CHANGE 消息来触发抽屉状态刷新
        this._drawerStateService.sendComponentMessage({
          name: 'TAB_VIEW_CHANGE',
          data: actualViewId
        });
      }, 100);
    } catch (error) {
      console.error('重连失败:', error);
      this.setReconnectState(currentViewId, {
        reconnectLoading: false,
        loading: false,
        showReconnectButton: true,
        failed: true,
        hasValidIframe: false
      });
    }
  }

  private cleanupFailedView(viewId: string): void {
    const existingIframe = this.iframes.get(viewId);

    if (existingIframe && this.iframeContainer?.nativeElement) {
      this.renderer.removeChild(this.iframeContainer.nativeElement, existingIframe);
      this.iframes.delete(viewId);
    }

    if (this.currentDisplayedViewId === viewId) {
      this.currentDisplayedViewId = null;
    }
  }

  private async createNewIframe(viewId: string, view: View): Promise<void> {
    if (!this.iframeContainer?.nativeElement) {
      return;
    }

    if (this.isDisabledCategory()) {
      return;
    }

    try {
      const url = await this.generateIframeURL(view);

      if (
        !url ||
        url.includes('token=undefined') ||
        url.includes('token=null') ||
        !url.includes('token=')
      ) {
        throw new Error('Invalid token or URL generated');
      }

      const iframe = this.renderer.createElement('iframe');
      this.renderer.setAttribute(iframe, 'src', url);
      this.renderer.setAttribute(iframe, 'frameborder', '0');
      this.renderer.setAttribute(iframe, 'data-view-id', viewId);
      this.renderer.setStyle(iframe, 'width', '100%');
      this.renderer.setStyle(iframe, 'height', 'calc(100vh - 170px)');
      this.renderer.setStyle(iframe, 'display', 'block');
      this.renderer.appendChild(this.iframeContainer.nativeElement, iframe);

      this.iframes.set(viewId, iframe);

      // 成功创建iframe后更新状态
      this.setReconnectState(viewId, {
        hasValidIframe: true,
        loading: false,
        failed: false
      });
    } catch (error) {
      console.error('Failed to create iframe for viewId:', viewId, error);

      this.setReconnectState(viewId, {
        showReconnectButton: true,
        failed: true,
        reconnectLoading: false,
        loading: false,
        hasValidIframe: false
      });

      throw error;
    }
  }

  private switchToView(viewId: string): void {
    this.iframes.forEach(iframe => {
      this.renderer.setStyle(iframe, 'display', 'none');
    });

    const reconnectState = this.getReconnectState(viewId);

    // 如果当前viewId有有效的iframe且不在失败状态，则显示对应的iframe
    if (reconnectState.hasValidIframe && !reconnectState.failed && !reconnectState.loading) {
      const currentIframe = this.iframes.get(viewId);
      if (currentIframe) {
        this.renderer.setStyle(currentIframe, 'display', 'block');
        this.currentDisplayedViewId = viewId;
      }
    } else {
      // 如果没有有效 iframe 或处于失败 loading 状态，不显示任何 iframe
      this.currentDisplayedViewId = null;
    }
  }

  private async generateIframeURL(view: View): Promise<string> {
    try {
      const currentViewId = this.currentViewId();
      const directToken = this.directTokens.get(currentViewId);

      let tokenId: string;

      // 如果是direct模式且有直接 token，使用直接 token
      if (directToken) {
        tokenId = directToken;
      } else {
        const oldToken = view.connectToken;
        const newToken = await this._connectTokenSvc.exchange(oldToken);

        if (!newToken || !newToken.id) {
          throw new Error('Token exchange failed or returned invalid token');
        }

        tokenId = newToken.id;
      }

      const url = `${view.smartEndpoint.getUrl()}/koko/sftp/?token=${tokenId}`;

      return url;
    } catch (error) {
      console.error('Failed to generate iframe URL:', error);
      throw error;
    }
  }
}
