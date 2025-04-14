import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';
import { LogService } from '@app/services';

@Component({
  selector: 'pages-kubernetes',
  templateUrl: './kubernetes.component.html',
})
export class PagesKubernetesComponent implements OnInit, AfterViewInit {
  @ViewChild('iFrame', { static: false }) iframeRef: ElementRef;

  public ping;
  public id: string = '';
  public token: string = '';
  public iframeURL: string = '';

  constructor(private _route: ActivatedRoute, private _logger: LogService) {}

  ngOnInit(): void {
    this.id = 'window-' + Math.random().toString(36).substr(2);
    const baseUrl = `${window.location.protocol}//${window.location.host}`;

    this._route.params.subscribe((params: Params) => {
      this.token = params['token'];
    });

    this.iframeURL = `${baseUrl}/koko/k8s/?token=${this.token}`;
  }

  ngAfterViewInit() {
    this.handleK8sIframeEvent();
  }

  private handleK8sIframeEvent() {
    this.ping = setInterval(() => {
      this._logger.info(`[Luna] Send K8s PING to: ${this.id}`);
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
