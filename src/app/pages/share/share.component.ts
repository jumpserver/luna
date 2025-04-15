import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core'

// TODO 4.9 发布后与 kubernetes 合并
@Component({
  selector: 'pages-share',
  templateUrl: './share.component.html',
})
export class PagesShareComponent implements OnInit, AfterViewInit  {
  @ViewChild('iFrame', { static: false }) iframeRef: ElementRef;

  public ping;
  public id: string = '';
  public shareId: string = '';
  public iframeURL: string = '';

  constructor(private _route: ActivatedRoute) {}

  ngOnInit(): void {
    this.id = 'window-' + Math.random().toString(36).substr(2);
    this.shareId = this._route.snapshot.params['id'];
    const baseUrl = `${window.location.protocol}//${window.location.host}`;

    this.iframeURL = `${baseUrl}/koko/share/${this.shareId}`;
  }

  ngAfterViewInit(): void {
    this.handleK8sIframeEvent();
  }

  handleK8sIframeEvent() {
    this.ping = setInterval(() => {
      this.iframeRef.nativeElement.contentWindow.postMessage({ name: 'PING', id: this.id }, '*');
    }, 1000);

    window.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.name) {
        case 'PONG':
          clearInterval(this.ping);
          break;
        case 'PING':
          this.iframeRef.nativeElement.contentWindow.postMessage({ name: 'PING', id: this.id }, '*');
          break;
        default:
          break;
      }
    });
  }
}
