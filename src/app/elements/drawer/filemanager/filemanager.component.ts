import { View } from '@app/model';
import { ConnectTokenService } from '@app/services';
import {
  Component,
  OnDestroy,
  OnInit,
  AfterViewInit,
  input,
  ViewChild,
  ElementRef,
  Renderer2,
  effect
} from '@angular/core';

@Component({
  standalone: false,
  selector: 'elements-filemanager',
  templateUrl: 'filemanager.component.html',
  styleUrls: ['filemanager.component.scss']
})
export class ElementFileManagerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('iframeContainer') iframeContainer: ElementRef;

  view = input<View | null>(null);
  currentViewId = input<string>('');

  private viewInitialized = false;
  private iframes = new Map<string, HTMLIFrameElement>();
  private currentDisplayedViewId: string | null = null;

  constructor(
    private readonly renderer: Renderer2,
    private readonly _connectTokenSvc: ConnectTokenService
  ) {
    effect(() => {
      const currentViewId = this.currentViewId();
      const view = this.view();

      if (!this.viewInitialized || !currentViewId || !view) {
        return;
      }

      if (!this.iframes.has(currentViewId)) {
        this.createNewIframe(currentViewId, view);
      }

      setTimeout(() => {
        this.switchToView(currentViewId);
      }, 100);
    });
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.viewInitialized = true;
  }

  ngOnDestroy(): void {
    this.iframes.clear();
  }

  public destroyIframeByViewId(viewId: string): void {
    const iframe = this.iframes.get(viewId);

    if (iframe && this.iframeContainer?.nativeElement) {
      this.renderer.removeChild(this.iframeContainer.nativeElement, iframe);

      this.iframes.delete(viewId);

      console.log('Destroyed iframe for viewId:', viewId);

      if (this.currentDisplayedViewId === viewId) {
        this.currentDisplayedViewId = null;
      }
    }
  }

  private async createNewIframe(viewId: string, view: View): Promise<void> {
    if (!this.iframeContainer?.nativeElement) {
      return;
    }

    try {
      const url = await this.generateIframeURL(view);

      const iframe = this.renderer.createElement('iframe');
      this.renderer.setAttribute(iframe, 'src', url);
      this.renderer.setAttribute(iframe, 'frameborder', '0');
      this.renderer.setAttribute(iframe, 'data-view-id', viewId);
      this.renderer.setStyle(iframe, 'width', '100%');
      this.renderer.setStyle(iframe, 'height', 'calc(100vh - 170px)');
      this.renderer.setStyle(iframe, 'display', 'block');
      this.renderer.appendChild(this.iframeContainer.nativeElement, iframe);

      this.iframes.set(viewId, iframe);
    } catch (error) {
      console.error('Failed to create iframe for viewId:', viewId, error);
    }
  }

  private switchToView(viewId: string): void {
    this.iframes.forEach((iframe, id) => {
      this.renderer.setStyle(iframe, 'display', 'none');
      console.log('Hidden iframe:', id);
    });

    const currentIframe = this.iframes.get(viewId);

    if (currentIframe) {
      this.renderer.setStyle(currentIframe, 'display', 'block');
      this.currentDisplayedViewId = viewId;
    } else {
      console.warn('No iframe found for viewId:', viewId);
    }
  }

  private async generateIframeURL(view: View): Promise<string> {
    const oldToken = view.connectToken;
    const newToken = await this._connectTokenSvc.exchange(oldToken);
    return `${view.smartEndpoint.getUrl()}/koko/sftp/?token=${newToken?.id}`;
  }
}
