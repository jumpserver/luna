import { BehaviorSubject, Subject } from 'rxjs';
import { ElementChatComponent } from './chat.component';

describe('ElementChatComponent', () => {
  let component: ElementChatComponent;
  let viewService: {
    currentView$: BehaviorSubject<any>;
  };
  let settingService: {
    globalSetting: any;
    globalSetting$: BehaviorSubject<any>;
  };
  let drawerStateService: {
    sendComponentMessage: jasmine.Spy;
  };
  let iframeCommunicationService: {
    message$: Subject<any>;
  };
  let chatWindow: {
    postMessage: jasmine.Spy;
  };
  let terminalWindow: {
    postMessage: jasmine.Spy;
  };

  const dispatchChatMessage = (event: Partial<MessageEvent>) => {
    (component as any).onChatWindowMessage(event as MessageEvent);
  };

  const readyMessage = (overrides: Partial<MessageEvent> = {}) => ({
    source: chatWindow as unknown as Window,
    origin: window.location.origin,
    data: { name: 'CHAT_IFRAME_READY' },
    ...overrides
  });

  beforeEach(() => {
    viewService = {
      currentView$: new BehaviorSubject<any>(null)
    };
    settingService = {
      globalSetting: {
        CHAT_AI_ENABLED: true,
        CHAT_AI_METHOD: 'api'
      },
      globalSetting$: new BehaviorSubject<any>({
        CHAT_AI_ENABLED: true,
        CHAT_AI_METHOD: 'api'
      })
    };
    drawerStateService = {
      sendComponentMessage: jasmine.createSpy('sendComponentMessage')
    };
    iframeCommunicationService = {
      message$: new Subject<any>()
    };
    chatWindow = {
      postMessage: jasmine.createSpy('chatWindow.postMessage')
    };
    terminalWindow = {
      postMessage: jasmine.createSpy('terminalWindow.postMessage')
    };

    component = new ElementChatComponent(
      viewService as any,
      settingService as any,
      drawerStateService as any,
      iframeCommunicationService as any
    );
    component.iframeRef = {
      nativeElement: {
        contentWindow: chatWindow
      }
    } as any;

    component.ngOnInit();
    viewService.currentView$.next({
      id: 'view-1',
      name: 'Terminal 1',
      iframeElement: terminalWindow,
      terminalContentData: {
        content: 'ls -la',
        command: 'ls -la'
      }
    });
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('does not post open before the iframe is ready', () => {
    component.showChatAI();

    expect(component.chatAIShown).toBeTrue();
    expect(chatWindow.postMessage).not.toHaveBeenCalled();
  });

  it('replays the current open state exactly once after a valid ready message', () => {
    component.showChatAI();

    dispatchChatMessage(readyMessage());
    dispatchChatMessage(readyMessage());

    expect(component.chatIframeReady).toBeTrue();
    expect(chatWindow.postMessage).toHaveBeenCalledTimes(2);
    expect(chatWindow.postMessage.calls.argsFor(0)).toEqual([
      {
        name: 'current_terminal_content',
        data: {
          viewId: 'view-1',
          viewName: 'Terminal 1',
          content: 'ls -la',
          command: 'ls -la'
        }
      },
      window.location.origin
    ]);
    expect(chatWindow.postMessage.calls.argsFor(1)).toEqual([
      {
        name: 'CHAT_PANEL_COMMAND',
        data: { action: 'open' }
      },
      window.location.origin
    ]);
  });

  it('replays only the final close state when the panel was opened then closed before ready', () => {
    component.showChatAI();
    (component as any).closeChatAI();

    dispatchChatMessage(readyMessage());

    expect(chatWindow.postMessage).toHaveBeenCalledTimes(1);
    expect(chatWindow.postMessage).toHaveBeenCalledWith(
      {
        name: 'CHAT_PANEL_COMMAND',
        data: { action: 'close' }
      },
      window.location.origin
    );
  });

  it('ignores ready messages from the wrong source or origin', () => {
    component.showChatAI();

    dispatchChatMessage(
      readyMessage({
        source: {} as Window
      })
    );
    dispatchChatMessage(
      readyMessage({
        origin: 'https://example.invalid'
      })
    );

    expect(component.chatIframeReady).toBeFalse();
    expect(chatWindow.postMessage).not.toHaveBeenCalled();
  });

  it('posts open immediately once the iframe is already ready', () => {
    dispatchChatMessage(readyMessage());
    chatWindow.postMessage.calls.reset();

    component.showChatAI();

    expect(chatWindow.postMessage.calls.argsFor(0)).toEqual([
      {
        name: 'current_terminal_content',
        data: {
          viewId: 'view-1',
          viewName: 'Terminal 1',
          content: 'ls -la',
          command: 'ls -la'
        }
      },
      window.location.origin
    ]);
    expect(chatWindow.postMessage.calls.argsFor(1)).toEqual([
      {
        name: 'CHAT_PANEL_COMMAND',
        data: { action: 'open' }
      },
      window.location.origin
    ]);
  });

  it('resets iframe readiness when chat ai is disabled and enabled again', () => {
    dispatchChatMessage(readyMessage());
    chatWindow.postMessage.calls.reset();

    settingService.globalSetting = {
      CHAT_AI_ENABLED: false,
      CHAT_AI_METHOD: 'api'
    };
    settingService.globalSetting$.next(settingService.globalSetting);

    expect(component.chatIframeReady).toBeFalse();
    expect(component.iframeURL).toBe('');

    settingService.globalSetting = {
      CHAT_AI_ENABLED: true,
      CHAT_AI_METHOD: 'api'
    };
    settingService.globalSetting$.next(settingService.globalSetting);

    component.showChatAI();

    expect(chatWindow.postMessage).not.toHaveBeenCalled();
  });
});
