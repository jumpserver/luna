import {Component, Input, OnInit, AfterViewInit, ViewChild, ElementRef, Output, EventEmitter} from '@angular/core';
import {View} from '@app/model';

@Component({
  selector: 'elements-iframe',
  templateUrl: './iframe.component.html',
  styleUrls: ['./iframe.component.scss']
})
export class ElementIframeComponent implements OnInit, AfterViewInit {
  @Input() src: any;
  @Input() id: string;
  @Input() view: View;
  @ViewChild('iFrame', {static: false}) iframeRef: ElementRef;
  @Output() onLoad: EventEmitter<Boolean> = new EventEmitter<Boolean>();
  iframeWindow: Window;

  constructor() {
  }

  ngOnInit() {
    this.id = 'window-' + Math.random().toString(36).substr(2);
  }

  ngAfterViewInit() {
    this.iframeWindow = this.iframeRef.nativeElement.contentWindow;
    this.handleIframeEvent();
  }

  setActive() {
    this.iframeWindow.postMessage({name: 'FOCUS'}, '*');
  }

  handleIframeEvent() {
    const pingInterval = setInterval(() => {
      this.iframeWindow.postMessage({name: 'PING', id: this.id}, this.iframeWindow.origin);
    }, 500);

    window.addEventListener('message', (e) => {
      const msg = e.data;
      console.log('Get msg from iframe: ', msg);
      if (msg.id !== this.id) {
        return;
      }
      switch (msg.name) {
        case 'PONG':
          console.log('Iframe has been done');
          this.iframeRef.nativeElement.style.visibility = '';
          this.view.termComp = this;
          clearInterval(pingInterval);
          break;
        case 'CLOSE':
          this.view.connected = false;
          break;
        case 'CLICK':
          document.body.click();
          break;
      }
    });
  }

  sendCommand(data) {
    this.iframeWindow.postMessage({name: 'CMD', data: data.data}, this.iframeWindow.origin);
    // const iframeWindow = this.iframeRef.nativeElement.iframeWindow;
    // iframeWindow.SendTerminalData(data.data);
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
