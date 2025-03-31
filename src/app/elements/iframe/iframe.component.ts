import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {View} from '@app/model';
import {ConnectTokenService, HttpService, I18nService, LogService, ViewService} from '@app/services';
import {MatDialog} from '@angular/material';
import {Subject} from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import {environment} from '@src/environments/environment';
import {SafeResourceUrl} from '@angular/platform-browser';
import {DomSanitizer} from '@angular/platform-browser';
import {FaceService} from '@app/services/face';

@Component({
  selector: 'elements-iframe',
  templateUrl: './iframe.component.html',
  styleUrls: ['./iframe.component.scss']
})
export class ElementIframeComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() src: any;
  @Input() id: string;
  @Input() view: View;
  @Input() origin: string;
  @ViewChild('iFrame', {static: false}) iframeRef: ElementRef;
  @Output() onLoad: EventEmitter<Boolean> = new EventEmitter<Boolean>();
  @Output() socketCloseEvent: EventEmitter<Boolean> = new EventEmitter<Boolean>();
  @Output() createFileConnectToken: EventEmitter<Boolean> = new EventEmitter<Boolean>();
  eventHandler: EventListenerOrEventListenerObject;
  private renewalTrigger = new Subject<void>();
  iframeWindow: Window;
  showIframe = false;
  showValue: boolean = !window['debugIframe'];
  ping: number;
  debug = false;
  trustedUrl: SafeResourceUrl;
  termComp: any = {};

  constructor(
    private _i18n: I18nService,
    private _logger: LogService,
    private _connectTokenSvc: ConnectTokenService,
    private _http: HttpService,
    private _dialog: MatDialog,
    public viewSrv: ViewService,
    private sanitizer: DomSanitizer,
    private faceService: FaceService
  ) {
  }
  ngOnInit() {
    this._logger.info(`IFrame URL: ${this.src}`);

    if (!environment.production) {
      this.debug = true;
      setTimeout(() => {
        this.debug = false;
      }, 5000);
    }

    this.renewalTrigger.pipe(
      debounceTime(2000)
    ).subscribe(() => {
      this._http.get(`/api/v1/health/`).subscribe();
    });


    this.id = 'window-' + Math.random().toString(36).substr(2);

    this.eventHandler = function (e: any) {
      const msg = e.data;

      if (msg.id !== this.id) { return; }

      switch (msg.name) {
        case 'PING': {
          this.iframeWindow.postMessage({name: 'PONG', id: this.id}, '*');
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
          this.socketCloseEvent.emit(true);
          if (this.view && this.view.connectToken && this.view.connectToken.face_monitor_token) {
            this.faceService.removeMonitoringTab(this.view.id);
          }
          break;
        case 'CONNECTED':
          this.view.connected = true;
          if (this.view.connectToken.face_monitor_token) {
            this.faceService.addMonitoringTab(this.view.id);
          }
          break;
        case 'CLICK':
          document.body.click();
          break;
        case 'KEYEVENT':
          window.focus();
          setTimeout(() => {
            this.viewSrv.keyboardSwitchTab(msg.data);
          }, 200);
          break;
        case 'KEYBOARDEVENT':
        case 'MOUSEEVENT':
          this.renewalTrigger.next();
          break;
        case 'CREATE_FILE_CONNECT_TOKEN':
          this.createFileConnectToken.emit(true);
          break;
      }
    }.bind(this);

    this.trustedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.src);

    window.addEventListener('message', this.messageHandler);
  }

  ngAfterViewInit() {
    if (this.origin !== 'direct' && this.iframeRef) {
      this.iframeWindow = this.iframeRef.nativeElement.contentWindow;
      this.view.iframeElement = this.iframeWindow;
      this.handleIframeEvent();

      return;
    }

    this.iframeWindow = this.iframeRef.nativeElement.contentWindow;
    this.handleIframeEvent();
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.eventHandler);
    window.removeEventListener('message', this.messageHandler);
  }

  setActive() {
    this._logger.debug(`[Luna] Send FOCUS to: ${this.id}`);
    this.iframeWindow.postMessage({name: 'FOCUS'}, '*');
  }

  handleIframeEvent() {
    // @ts-ignore
    this.ping = setInterval(() => {
      this._logger.info(`[Luna] Send PING to: ${this.id}`);
      this.iframeWindow.postMessage({name: 'PING', id: this.id}, '*');
    }, 500);

    window.addEventListener('message', this.eventHandler);

    // 长时间未PING通, 则主动关闭
    setTimeout(function () {
      clearInterval(this.ping);
      this.showIframe = this.showValue;
    }.bind(this), 1000 * 10);
  }

  sendCommand(data) {
    this._logger.info(`[Luna] Send CMD to: ${this.id}`);
    this.iframeWindow.postMessage({name: 'CMD', data: data.data}, '*');
  }

  messageHandler = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object') {
      this.termComp = event.data;
    }
  };

  async reconnect() {
    const oldConnectToken = this.view.connectToken;
    const newConnectToken = await this._connectTokenSvc.exchange(oldConnectToken);

    if (!newConnectToken) {
      return;
    }

    // 更新当前 view 的 connectToken
    this.src = 'about:blank';
    this.view.connectToken = newConnectToken;

    const url = this.src.replace(oldConnectToken.id, newConnectToken.id);

    setTimeout(() => {
      this.src = url;
      this.view.connected = true;
      this.view.active = true;
    }, 100);
  }
}
