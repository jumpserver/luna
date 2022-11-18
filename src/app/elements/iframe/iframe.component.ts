import {Component, Input, OnInit, AfterViewInit, ViewChild, ElementRef, Output, EventEmitter, OnDestroy} from '@angular/core';
import {View} from '@app/model';
import {I18nService, LogService} from '@app/services';

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
  iframeWindow: Window;
  show = false;
  eventHandler: EventListenerOrEventListenerObject;
  ping: number;

  constructor(
    private _i18n: I18nService,
    private _logger: LogService
  ) {
  }

  ngOnInit() {
    this._logger.info(`IFrame URL: ${this.src}`);
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

  reconnect() {
    const url = this.src;
    this.src = 'about:blank';
    setTimeout(() => {
      this.src = url;
    }, 100);
    this.view.connected = true;
  }
}
