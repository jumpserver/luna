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

  constructor() {
  }

  ngOnInit() {
    this.id = 'window-' + Math.random().toString(36).substr(2)
  }

  ngAfterViewInit() {
    this.onIframeLoadDone();
  }

  setActive() {
    const win = this.iframeRef.nativeElement.contentWindow;
    win.dispatchEvent(new Event('jmsFocus'));
  }

  onIframeLoadDone() {
    let t ;
    const that = this;
    t = window.setInterval(() => {
      const i = this.iframeRef.nativeElement;
      if (i.contentWindow.document.readyState === 'complete') {
        window.clearInterval(t);
        this.view.termComp = that;

        // iframe 点击的时候，透传到外层，一些菜单会折叠
        setTimeout(() => {
          i.contentWindow.addEventListener('click', function() {
            document.body.click();
          });
        }, 300);

        // 内部加载完成后再显示
        setTimeout(() => {
          i.style.visibility = '';
          i.contentWindow.addEventListener('CLOSE', (e) => {
            this.view.connected = false;
          });
        }, 300);
      }
    }, 100);
    setTimeout(() => {
      window.clearInterval(t);
    }, 5000);
  }

  sendCommand(data) {
    const iframeWindow = this.iframeRef.nativeElement.contentWindow;
    iframeWindow.SendTerminalData(data.data);
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
