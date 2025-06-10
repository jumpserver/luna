import {ActivatedRoute} from '@angular/router';
import {AfterViewInit, Component, ElementRef, OnInit, ViewChild} from '@angular/core';

// TODO 与 kubernetes 合并
@Component({
  standalone: false,
  selector: 'pages-share',
  templateUrl: 'share.component.html',
})
export class PagesShareComponent implements OnInit, AfterViewInit {
  @ViewChild('iFrame', {static: false}) iframeRef: ElementRef;

  public ping;
  public id: string = '';
  public type: string = '';
  public shareId: string = '';
  public iframeURL: string = '';

  constructor(private _route: ActivatedRoute) {
  }

  ngOnInit(): void {
    this.id = 'window-' + Math.random().toString(36).substr(2);
    this.shareId = this._route.snapshot.params['id'];
    this.type = this._route.snapshot.queryParams['type'];

    const baseUrl = `${window.location.protocol}//${window.location.host}`;

    if (this.type && this.type === 'lion') {
      this.iframeURL = `${baseUrl}/lion/share/${this.shareId}`;
      return;
    }

    this.iframeURL = `${baseUrl}/koko/share/${this.shareId}`;
  }

  ngAfterViewInit(): void {
    this.handleK8sIframeEvent();
  }

  handleK8sIframeEvent() {
    this.ping = setInterval(() => {
      this.iframeRef.nativeElement.contentWindow.postMessage({name: 'PING', id: this.id}, '*');
    }, 1000);

    window.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.name) {
        case 'PONG':
          clearInterval(this.ping);
          break;
        case 'PING':
          this.iframeRef.nativeElement.contentWindow.postMessage({name: 'PING', id: this.id}, '*');
          break;
        default:
          break;
      }
    });
  }
}
