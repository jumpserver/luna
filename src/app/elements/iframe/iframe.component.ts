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

  constructor(
    private _i18n: I18nService,
    private _logger: LogService,
    private _connectTokenSvc: ConnectTokenService,
    private _http: HttpService,
    public _viewSvc: ViewService,
    private sanitizer: DomSanitizer,
    private faceService: FaceService,
    private _iframeSvc: IframeCommunicationService
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
          console.log('CLICK', msg);
          document.body.click();
          break;
        case 'KEYEVENT':
          window.focus();
          setTimeout(() => {
            this._viewSvc.keyboardSwitchTab(msg.data);
          }, 200);
          break;
        case 'KEYBOARDEVENT':
        case 'MOUSEEVENT':
          this.renewalTrigger.next();
          break;
        case 'CREATE_FILE_CONNECT_TOKEN':
          this.createFileConnectToken.emit(true);
          break;
        case 'SHARE_USER_ADD':
          this._iframeSvc.sendMessage({ name: 'SHARE_USER_ADD', data: msg.data });
          break;
        case 'SHARE_CODE_RESPONSE':
          this._iframeSvc.sendMessage({ name: 'SHARE_CODE_RESPONSE', data: msg.data });
          break;
        case 'TERMINAL_CONTENT_RESPONSE':
          this.view.terminalContentData = msg.data;
          break;
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
    // @ts-ignore
    this.ping = setInterval(() => {
      this._logger.info(`[Luna] Send PING to: ${this.id}`);
      this.iframeWindow.postMessage(
        { name: 'PING', id: this.id, protocol: this.view.protocol },
        '*'
      );
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
      this._logger.info('[Luna] Send msg to iframe: ', message);
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

    setTimeout(() => {
      this.src = url;
      this.view.connected = true;
      this.view.active = true;
    }, 100);
  }
}
