import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { View } from '@app/model';
import {
  DrawerStateService,
  IframeCommunicationService,
  SettingService,
  ViewService
} from '@app/services';
import { withUIBase } from '@app/utils/path';
import { Subscription } from 'rxjs';

interface LauncherPosition {
  x: number;
  y: number;
}

interface PersistedLauncherPosition extends LauncherPosition {
  height: number;
  width: number;
}

@Component({
  standalone: false,
  selector: 'elements-chat',
  templateUrl: 'chat.component.html',
  styleUrls: ['chat.component.scss']
})
export class ElementChatComponent implements OnInit, OnDestroy {
  @ViewChild('contentWindow') iframeRef?: ElementRef<HTMLIFrameElement>;
  @ViewChild('launcher') launcherRef?: ElementRef<HTMLElement>;

  iframeURL = '';
  currentView: View | null = null;
  chatAIShown = false;
  chatPanelExpanded = false;
  isDragging = false;

  private readonly subscriptions = new Subscription();
  private readonly dragThreshold = 3;
  private readonly launcherPositionStorageKey = 'luna.chat-launcher-position.v1';
  private activePointerId: number | null = null;
  private dragStartPointer = { x: 0, y: 0 };
  private dragStartPosition: LauncherPosition | null = null;
  private launcherPosition: LauncherPosition | null = null;
  private chatMessageListenerRegistered = false;

  constructor(
    public viewSrv: ViewService,
    public _settingSvc: SettingService,
    private _drawerStateService: DrawerStateService,
    private _iframeSvc: IframeCommunicationService
  ) {}

  get isShowSetting(): boolean {
    const connectMethods = ['koko', 'lion', 'tinker', 'panda'];
    const currentView = this.currentView;

    if (!currentView || currentView.protocol === 'sftp' || currentView.protocol === 'k8s') {
      return false;
    }

    return (
      Object.prototype.hasOwnProperty.call(currentView, 'connectMethod') &&
      currentView.connected &&
      connectMethods.includes(currentView.connectMethod.component)
    );
  }

  get subViews(): View[] {
    return this.currentView?.subViews ?? [];
  }

  get chatAiApiEnabled(): boolean {
    const setting = this._settingSvc.globalSetting;
    return Boolean(setting.CHAT_AI_ENABLED && setting.CHAT_AI_METHOD === 'api');
  }

  get launcherStyle(): Record<string, string> {
    if (!this.launcherPosition) {
      return {
        top: 'auto',
        right: '9px',
        bottom: '200px',
        left: 'auto'
      };
    }

    return {
      top: `${this.launcherPosition.y}px`,
      right: 'auto',
      bottom: 'auto',
      left: `${this.launcherPosition.x}px`
    };
  }

  ngOnInit(): void {
    this.loadLauncherPosition();

    this.subscriptions.add(
      this.viewSrv.currentView$.subscribe((state: View) => {
        this.currentView = state;
      })
    );

    this.subscriptions.add(
      this._settingSvc.globalSetting$.subscribe(setting => {
        if (!setting.CHAT_AI_ENABLED) {
          this.closeChatAI(false);
          return;
        }

        if (setting.CHAT_AI_METHOD === 'embed') {
          this.closeChatAI(false);
          this.insertEmbedScript();
        } else if (setting.CHAT_AI_METHOD === 'api') {
          this.listenChatAI();
        }
      })
    );

    this.subscriptions.add(
      this._iframeSvc.message$.subscribe(message => {
        this.handleIframeMessage(message);
        if (message.name === 'SEND_CHAT_IFRAME') {
          this._drawerStateService.sendComponentMessage({
            name: 'OPEN_CHAT',
            data: this.iframeURL
          });
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.chatMessageListenerRegistered) {
      window.removeEventListener('message', this.onChatWindowMessage);
    }
  }

  showChatAI(): void {
    const chatWindow = this.iframeRef?.nativeElement.contentWindow;
    if (!chatWindow) {
      return;
    }

    this.currentView?.iframeElement?.postMessage({ name: 'CLOSE' }, '*');
    this.postCurrentTerminalContextToChatAI();
    this.postChatCommand('open');
    this.chatPanelExpanded = false;
    this.chatAIShown = true;
  }

  handleShowDrawer(): void {
    this.closeChatAI();
    this.currentView?.iframeElement?.postMessage({ name: 'OPEN' }, '*');
  }

  postCurrentTerminalContextToChatAI(): void {
    const chatWindow = this.iframeRef?.nativeElement.contentWindow;
    const currentView = this.currentView;
    const data = currentView?.terminalContentData;
    if (!chatWindow || !currentView || !data?.content) {
      return;
    }

    chatWindow.postMessage(
      {
        name: 'current_terminal_content',
        data: {
          viewId: currentView.id,
          viewName: currentView.name,
          ...data
        }
      },
      window.location.origin
    );
  }

  onLauncherPointerDown(event: PointerEvent): void {
    if (
      !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0) ||
      !this.launcherRef
    ) {
      return;
    }

    this.finishLauncherDrag();
    const rect = this.launcherRef.nativeElement.getBoundingClientRect();
    this.activePointerId = event.pointerId;
    this.dragStartPointer = { x: event.clientX, y: event.clientY };
    this.dragStartPosition = { x: rect.left, y: rect.top };
    this.launcherRef.nativeElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId || !this.dragStartPosition) {
      return;
    }

    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      this.finishLauncherDrag(event.pointerId);
      return;
    }

    const deltaX = event.clientX - this.dragStartPointer.x;
    const deltaY = event.clientY - this.dragStartPointer.y;
    if (!this.isDragging && Math.hypot(deltaX, deltaY) < this.dragThreshold) {
      return;
    }

    this.isDragging = true;
    this.launcherPosition = this.clampLauncherPosition({
      x: this.dragStartPosition.x + deltaX,
      y: this.dragStartPosition.y + deltaY
    });
    event.preventDefault();
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  onDocumentPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    this.finishLauncherDrag(event.pointerId);
  }

  onLauncherLostPointerCapture(event: PointerEvent): void {
    if (event.pointerId === this.activePointerId) {
      this.finishLauncherDrag(event.pointerId, false);
    }
  }

  onLauncherKeydown(event: KeyboardEvent): void {
    const directions: Partial<Record<string, LauncherPosition>> = {
      ArrowUp: { x: 0, y: -10 },
      ArrowRight: { x: 10, y: 0 },
      ArrowDown: { x: 0, y: 10 },
      ArrowLeft: { x: -10, y: 0 }
    };
    const direction = directions[event.key];
    const launcher = this.launcherRef?.nativeElement;
    if (!direction || !launcher) {
      return;
    }

    const rect = launcher.getBoundingClientRect();
    const currentPosition = this.launcherPosition ?? { x: rect.left, y: rect.top };
    this.launcherPosition = this.clampLauncherPosition({
      x: currentPosition.x + direction.x,
      y: currentPosition.y + direction.y
    });
    this.persistLauncherPosition();
    event.preventDefault();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.launcherPosition) {
      return;
    }

    this.launcherPosition = this.clampLauncherPosition(this.launcherPosition);
    this.persistLauncherPosition();
  }

  @HostListener('window:blur')
  onWindowBlur(): void {
    this.finishLauncherDrag();
  }

  private insertEmbedScript(): void {
    const embedScriptId = 'chat-ai-embed-id';
    if (document.getElementById(embedScriptId)) {
      return;
    }

    const script = document.createElement('script');
    script.id = embedScriptId;
    script.src = this._settingSvc.globalSetting.CHAT_AI_EMBED_URL;
    script.async = true;
    script.onload = () => {
      const loadEvent = new Event('load', { bubbles: false, cancelable: false });
      window.dispatchEvent(loadEvent);
    };
    document.body.appendChild(script);
  }

  private listenChatAI(): void {
    this.iframeURL = withUIBase('#/chat/chat-ai?from=luna');
    if (!this.chatMessageListenerRegistered) {
      window.addEventListener('message', this.onChatWindowMessage);
      this.chatMessageListenerRegistered = true;
    }
  }

  private readonly onChatWindowMessage = (event: MessageEvent): void => {
    if (
      event.source !== this.iframeRef?.nativeElement.contentWindow ||
      event.origin !== window.location.origin
    ) {
      return;
    }

    const message = event.data;
    if (message === 'close-chat-panel') {
      this.closeChatAI(false);
      return;
    }
    if (message === 'show-chat-panel') {
      this.chatAIShown = true;
      return;
    }
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.name === 'CHAT_PANEL_STATE') {
      this.chatAIShown = Boolean(message.data?.open);
      this.chatPanelExpanded = message.data?.mode === 'expanded';
      return;
    }

    if (message.name === 'INSERT_TERMINAL_CODE') {
      this.currentView?.iframeElement?.postMessage({
        name: 'CMD',
        data: message.data
      });
    }
  };

  private closeChatAI(notifyChat = true): void {
    if (notifyChat) {
      this.postChatCommand('close');
    }
    this.chatAIShown = false;
    this.chatPanelExpanded = false;
  }

  private postChatCommand(action: 'open' | 'close'): void {
    const chatWindow = this.iframeRef?.nativeElement.contentWindow;
    if (!chatWindow) {
      return;
    }

    chatWindow.postMessage(
      {
        name: 'CHAT_PANEL_COMMAND',
        data: { action }
      },
      window.location.origin
    );
  }

  private handleIframeMessage(message: any): void {
    if (message.name === 'TERMINAL_CONTENT_RESPONSE') {
      this.postCurrentTerminalContextToChatAI();
    }
  }

  private clampLauncherPosition(position: LauncherPosition): LauncherPosition {
    const rect = this.launcherRef?.nativeElement.getBoundingClientRect();
    const width = rect?.width ?? 40;
    const height = rect?.height ?? 165;
    return {
      x: Math.max(0, Math.min(position.x, window.innerWidth - width)),
      y: Math.max(0, Math.min(position.y, window.innerHeight - height))
    };
  }

  private finishLauncherDrag(pointerId = this.activePointerId, releaseCapture = true): void {
    if (pointerId === null || pointerId !== this.activePointerId) {
      return;
    }

    const launcher = this.launcherRef?.nativeElement;
    const shouldPersist = this.isDragging && Boolean(this.launcherPosition);
    this.activePointerId = null;
    this.dragStartPosition = null;
    this.isDragging = false;

    if (releaseCapture && launcher?.hasPointerCapture(pointerId)) {
      launcher.releasePointerCapture(pointerId);
    }
    if (shouldPersist) {
      this.persistLauncherPosition();
    }
  }

  private persistLauncherPosition(): void {
    if (!this.launcherPosition) {
      return;
    }

    const rect = this.launcherRef?.nativeElement.getBoundingClientRect();
    const value: PersistedLauncherPosition = {
      ...this.launcherPosition,
      width: rect?.width ?? 40,
      height: rect?.height ?? 165
    };
    localStorage.setItem(this.launcherPositionStorageKey, JSON.stringify(value));
  }

  private loadLauncherPosition(): void {
    try {
      const stored = localStorage.getItem(this.launcherPositionStorageKey);
      if (!stored) {
        return;
      }

      const position = JSON.parse(stored) as Partial<PersistedLauncherPosition>;
      if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
        this.launcherPosition = {
          x: Math.max(
            0,
            Math.min(Number(position.x), window.innerWidth - Number(position.width ?? 40))
          ),
          y: Math.max(
            0,
            Math.min(Number(position.y), window.innerHeight - Number(position.height ?? 165))
          )
        };
      }
    } catch {
      localStorage.removeItem(this.launcherPositionStorageKey);
    }
  }
}
