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
  private viewIdOpenSettingStatus = new Map<string, boolean>();
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

      // 如果已经有 iframe，直接切换
      if (this.iframes.has(currentViewId)) {
        this.switchToView(currentViewId);
        return;
      }

      // 如果没有 iframe 且已经收到 OpenSetting 信号，则创建
      const hasReceivedOpenSetting = this.viewIdOpenSettingStatus.get(currentViewId) || false;
      if (hasReceivedOpenSetting) {
        this.createNewIframe(currentViewId, view);
        setTimeout(() => {
          this.switchToView(currentViewId);
        }, 100);
      } else {
        console.log(
          'Waiting for OpenSetting signal before creating iframe for viewId:',
          currentViewId
        );
      }
    });
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.viewInitialized = true;
  }

  ngOnDestroy(): void {
    this.iframes.clear();
    this.viewIdOpenSettingStatus.clear();
  }

  public enableFileManagerLogic(): void {
    const currentViewId = this.currentViewId();
    if (currentViewId) {
      // 为当前 viewId 标记已收到 OpenSetting 信号
      this.viewIdOpenSettingStatus.set(currentViewId, true);
    }

    // 手动触发逻辑执行
    const view = this.view();

    if (this.viewInitialized && currentViewId && view && !this.iframes.has(currentViewId)) {
      this.createNewIframe(currentViewId, view);
      setTimeout(() => {
        this.switchToView(currentViewId);
      }, 100);
    }
  }

  public destroyIframeByViewId(viewId: string): void {
    const iframe = this.iframes.get(viewId);

    if (iframe && this.iframeContainer?.nativeElement) {
      this.renderer.removeChild(this.iframeContainer.nativeElement, iframe);

      this.iframes.delete(viewId);
      // 同时清理对应的 OpenSetting 状态
      this.viewIdOpenSettingStatus.delete(viewId);

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
