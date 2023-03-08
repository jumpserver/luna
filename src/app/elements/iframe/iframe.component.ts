import {Component, Input, OnInit, AfterViewInit, ViewChild, ElementRef, Output, EventEmitter, OnDestroy} from '@angular/core';
import {ConnectionToken, View} from '@app/model';
import {HttpService, I18nService, LogService, ConnectTokenService} from '@app/services';
import {MatDialog} from '@angular/material';
import {environment} from '@src/environments/environment';
import {ElementACLDialogComponent} from '@app/elements/connect/acl-dialog/acl-dialog.component';

@Component({
  selector: 'elements-iframe',
  templateUrl: './iframe.component.html',
  styleUrls: ['./iframe.component.scss']
})
export class ElementIframeComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() src: any;
  @Input() id: string;
  @Input() view: View;
  @ViewChild('iFrame', {static: false}) iframeRef: ElementRef;
  @Output() onLoad: EventEmitter<Boolean> = new EventEmitter<Boolean>();
  eventHandler: EventListenerOrEventListenerObject;
  iframeWindow: Window;
  show = false;
  ping: number;
  debug = false;

  constructor(
    private _i18n: I18nService,
    private _logger: LogService,
    private _connectTokenSvc: ConnectTokenService,
    private _http: HttpService,
    private _dialog: MatDialog,
  ) {
  }

  ngOnInit() {
    this._logger.info(`IFrame URL: ${this.src}`);
    if (!environment.production) {
      this.debug = true;
    }
    this.id = 'window-' + Math.random().toString(36).substr(2);
    this.eventHandler = function (e: any) {
      const msg = e.data;
      if (msg.id !== this.id) {
        return;
      }
      console.log(`[Luna] Receive ${msg.name} from: ${msg.id}`);
      switch (msg.name) {
        case 'PONG':
          setTimeout(() => {
            this.show = true;
          });
          this.view.termComp = this;
          clearInterval(this.ping);
          break;
        case 'CLOSE':
          this.view.connected = false;
          break;
        case 'CONNECTED':
          this.view.connected = true;
          break;
        case 'CLICK':
          document.body.click();
          break;
      }
    }.bind(this);
  }

  ngAfterViewInit() {
    this.iframeWindow = this.iframeRef.nativeElement.contentWindow;
    this.handleIframeEvent();
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.eventHandler);
  }

  setActive() {
    this._logger.debug(`[Luna] Send FOCUS to: ${this.id}`);
    this.iframeWindow.postMessage({name: 'FOCUS'}, '*');
  }

  handleIframeEvent() {
    this.ping = setInterval(() => {
      this._logger.info(`[Luna] Send PING to: ${this.id}`);
      this.iframeWindow.postMessage({name: 'PING', id: this.id}, '*');
    }, 500);
    window.addEventListener('message', this.eventHandler);

    setTimeout(function () {
      // 长时间未PING通, 则主动关闭
      clearInterval(this.ping);
      this.show = true;
    }.bind(this), 1000 * 10);
  }

  sendCommand(data) {
    this._logger.info(`[Luna] Send CMD to: ${this.id}`);
    this.iframeWindow.postMessage({name: 'CMD', data: data.data}, '*' );
  }

  async reconnect() {
    const oldConnectToken = this.view.connectToken
    const newConnectToken = await this._connectTokenSvc.exchange(oldConnectToken)
    if (!newConnectToken) {
      return
    }
    // 更新当前 view 的 connectToken
    this.view.connectToken = newConnectToken
    const url = this.src.replace(oldConnectToken.id, newConnectToken.id)
    this.src = 'about:blank';
    setTimeout(() => {
      this.src = url;
    }, 100);
    this.view.connected = true;
  }
}
