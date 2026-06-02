import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import { View } from '@app/model';
import {
  ConnectTokenService,
  HttpService,
  I18nService,
  LogService,
  ViewService,
  IframeCommunicationService
} from '@app/services';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { environment } from '@src/environments/environment';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FaceService } from '@app/services/face';
import { DrawerStateService } from '@app/services/drawer';
import { Protocol } from '@app/model';

@Component({
  standalone: false,
  selector: 'elements-iframe',
  templateUrl: 'iframe.component.html',
  styleUrls: ['iframe.component.scss']
})
export class ElementIframeComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() src: any;
  @Input() id: string;
  @Input() view: View;
  @Input() origin: string;
  @ViewChild('iFrame', { static: false }) iframeRef: ElementRef;
  @Output() onLoad: EventEmitter<Boolean> = new EventEmitter<Boolean>();
  @Output() createFileConnectToken: EventEmitter<Boolean> = new EventEmitter<Boolean>();
  eventHandler: EventListenerOrEventListenerObject;
  private renewalTrigger = new Subject<void>();
  private subscription: Subscription;
  iframeWindow: Window;
  showIframe = false;
  showValue: boolean = !window['debugIframe'];
  ping: number;
  debug = false;
  trustedUrl: SafeResourceUrl;
  private lastSendInputActiveTime = 0;

  constructor(
    private _i18n: I18nService,
    private _logger: LogService,
    private _connectTokenSvc: ConnectTokenService,
    private _http: HttpService,
    public _viewSvc: ViewService,
    private sanitizer: DomSanitizer,
    private faceService: FaceService,
    private _iframeSvc: IframeCommunicationService,
    private _drawerStateService: DrawerStateService
  ) {}

  ngOnInit() {
    this._logger.info(`IFrame URL: ${this.src}`);

    if (!environment.production) {
      this.debug = true;
      setTimeout(() => {
        this.debug = false;
      }, 5000);
    }

    this.renewalTrigger.pipe(debounceTime(2000)).subscribe(() => {
      this._http.get(`/api/v1/health/`).subscribe();
    });

    this.id = 'window-' + Math.random().toString(36).substr(2);

    this.trustedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.src);
  }

  ngAfterViewInit() {
    this.iframeWindow = this.iframeRef.nativeElement.contentWindow;
    this.view.iframeElement = this.iframeWindow;

    this.eventHandler = function (e: any) {
      const msg = e.data;

      if (msg.id !== this.id) {
        return;
      }

      switch (msg.name) {
        case 'PING': {
          this.iframeWindow.postMessage({ name: 'PONG', id: this.id }, '*');
          break;
        }
        case 'PONG':
          setTimeout(() => {
            this.showIframe = this.showValue;
          });
          if (this.view) {
            this.view.termComp = this;
          }
          clearInterval(this.ping);
          break;
        case 'CLOSE':
          if (this.view && this.view.connected) {
            this.view.connected = false;
            this._drawerStateService.sendComponentMessage({ name: 'SSH_CLOSE', data: this.view });
          }
          if (this.view && this.view.connectToken && this.view.connectToken.face_monitor_token) {
            this.faceService.removeMonitoringTab(this.view.id);
          }
          this._iframeSvc.sendMessage({ name: 'CLOSE' });
          break;
        case 'CONNECTED':
          this.view.connected = true;
          if (this.view.connectToken.face_monitor_token) {
            this.faceService.addMonitoringTab(this.view.id);
          }
          break;
        case 'CLICK':
          this.renewalTrigger.next();

          document.body.click();
          document.dispatchEvent(
            new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true
            })
          );
          break;
        case 'KEYEVENT':
          window.focus();
          setTimeout(() => {
            this._viewSvc.keyboardSwitchTab(msg.data);
          }, 200);
          break;
        case 'CREATE_FILE_CONNECT_TOKEN':
          this.createFileConnectToken.emit(true);
          break;
        case 'SHARE_USER_ADD':
          this._drawerStateService.sendComponentMessage({ name: 'SHARE_USER_ADD', data: msg.data });
          break;
        case 'SHARE_CODE_RESPONSE':
          this._iframeSvc.sendMessage({ name: 'SHARE_CODE_RESPONSE', data: msg.data });
          break;
        case 'TERMINAL_CONTENT_RESPONSE':
          this.view.terminalContentData = msg.data;
          this._iframeSvc.sendMessage({ name: 'TERMINAL_CONTENT_RESPONSE', data: msg.data });
          break;
        case 'KEYBOARDEVENT':
        case 'MOUSEEVENT':
        case 'INPUT_ACTIVE':
          this.renewalTrigger.next();
          // KOKO 新定义的 input 事件，给所有其他 view 发送 sendInputActive 函数续期
          this.sendInputActiveToOtherViews();
      }
    }.bind(this);

    this.handleIframeEvent();
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.eventHandler);
    this.subscription.unsubscribe();
  }

  setActive() {
    this._logger.debug(`[Luna] Send FOCUS to: ${this.id}`);
    this.iframeWindow.postMessage({ name: 'FOCUS' }, '*');
  }

  handleIframeEvent() {
    let disbaleFileManager: boolean = false;

    // 对于没有授权 sftp 协议的资产，不会在 koko 中展示文件管理
    if (!this.view.asset.permed_protocols.some((protocol: Protocol) => protocol.name === 'sftp')) {
      disbaleFileManager = true;
    }

    // @ts-ignore
    this.ping = setInterval(() => {
      this._logger.info(`[Luna] Send PING to: ${this.id}`);
      this.iframeWindow.postMessage({ name: 'PING', id: this.id, disbaleFileManager }, '*');
    }, 500);

    // 30s 内未PING通, 则主动关闭
    setTimeout(
      function () {
        clearInterval(this.ping);
        this.showIframe = this.showValue;
      }.bind(this),
      1000 * 30
    );

    this.subscription = this._iframeSvc.message$.subscribe(message => {
      // this._logger.info('[Luna] Send msg to iframe: ', message);
      this.iframeWindow.postMessage(message, '*');
    });

    window.addEventListener('message', this.eventHandler);
  }

  sendCommand(data) {
    this._logger.info(`[Luna] Send CMD to: ${this.id}`);
    this.iframeWindow.postMessage({ name: 'CMD', data: data.data }, '*');
  }

  // 没有位置用啊
  // messageHandler = (event: MessageEvent) => {
  //   if (event.data && typeof event.data === 'object') {
  //     this.termComp = event.data;
  //   }
  // };

  async reconnect() {
    const oldConnectToken = this.view.connectToken;
    const newConnectToken = await this._connectTokenSvc.exchange(oldConnectToken);

    if (!newConnectToken) {
      return;
    }

    // 更新当前 view 的 connectToken
    this.view.connectToken = newConnectToken;

    const url = this.src.replace(oldConnectToken.id, newConnectToken.id);
    this.src = 'about:blank';

    // 清理旧的事件监听器
    window.removeEventListener('message', this.eventHandler);
    if (this.ping) {
      clearInterval(this.ping);
    }

    setTimeout(() => {
      this.src = url;
      this.view.connected = true;
      this.view.active = true;

      this.iframeWindow = this.iframeRef.nativeElement.contentWindow;
      this.view.iframeElement = this.iframeWindow;
      this.handleIframeEvent();
    }, 100);
  }

  sendInputActive() {
    this._logger.info(`[Luna] Send Input_ACTIVE to: ${this.id}`);
    this.iframeWindow.postMessage({ name: 'INPUT_ACTIVE', data: "" }, '*');
  }

  sendInputActiveToOtherViews() {
    const currentTime = Date.now();
    const minInterval = 10000; // 10秒间隔

    // 检查是否已经过了最少10秒间隔
    if (currentTime - this.lastSendInputActiveTime < minInterval) {
      return; // 如果间隔不足10秒，直接返回
    }

    // 更新最后发送时间
    this.lastSendInputActiveTime = currentTime;

    // 遍历所有 view，给除了当前 view 之外的其他 view 发送 sendInputActive
    this._viewSvc.viewList.forEach(view => {
      if (view.id !== this.view.id && view.termComp && typeof view.termComp.sendInputActive === 'function') {
        view.termComp.sendInputActive();
      }
    });
  }

}
