import { View } from '@app/model';
import { SettingService, ViewService } from '@app/services';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  HostListener,
  AfterViewInit
} from '@angular/core';

@Component({
  standalone: false,
  selector: 'elements-chat',
  templateUrl: 'chat.component.html',
  styleUrls: ['chat.component.scss']
})
export class ElementChatComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('contentWindow', { static: false }) iframeRef: ElementRef;
  showBtn = true;
  element: any;
  iframeURL: string;
  currentView: View;
  chatAIShown = false;
  chatAIInited = false;
  isDragging = false;
  showSettingDrawer = false;
  private startY = 0;
  private startTop = 0;
  private containerElement: HTMLElement;

  constructor(
    public viewSrv: ViewService,
    public _settingSvc: SettingService,
    private el: ElementRef
  ) {}

  ngAfterViewInit() {
    this.containerElement = this.el.nativeElement.querySelector('.chat-container');
  }

  get isShowSetting() {
    const connectMethods = ['koko', 'lion', 'tinker', 'panda'];
    return (
      this.currentView.hasOwnProperty('connectMethod') &&
      connectMethods.includes(this.currentView.connectMethod.component)
    );
  }

  get hasChatContainer() {
    return;
  }

  get subViews() {
    return this.currentView.hasOwnProperty('subViews') ? this.currentView.subViews : [];
  }

  get chatAiEnabled() {
    return this._settingSvc.globalSetting.CHAT_AI_ENABLED;
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    if (!this.containerElement) return;

    // 如果点击的是按钮，不启动拖动
    if (
      event.target instanceof HTMLElement &&
      (event.target.closest('nz-float-button') || event.target.closest('.ant-float-btn'))
    ) {
      return;
    }

    this.isDragging = true;
    this.startY = event.clientY;
    const rect = this.containerElement.getBoundingClientRect();
    this.startTop = rect.top;

    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isDragging || !this.containerElement) return;

    const deltaY = event.clientY - this.startY;
    const newTop = this.startTop + deltaY;

    // 限制拖动范围
    const minTop = 40; // 距离顶部最小距离
    const containerHeight = 100; // 组件实际高度
    const maxTop = window.innerHeight - containerHeight - 20; // 距离底部最小距离
    const boundedTop = Math.max(minTop, Math.min(newTop, maxTop));

    this.containerElement.style.top = `${boundedTop}px`;
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isDragging = false;
  }

  ngOnInit() {
    this.viewSrv.currentView$.subscribe((state: View) => {
      this.currentView = state;
    });

    this.iframeURL = '/ui/#/chat/chat-ai?from=luna';

    window.addEventListener('message', event => {
      // 确认消息的来源是你信任的域
      if (event.data === 'close-chat-panel') {
        this.chatAIShown = false;
        this.showBtn = !this.showBtn;
        console.log('Received message from iframe:', event.data);
      }
    });
  }

  ngOnDestroy() {
    // this.element.remove();
    this.viewSrv.currentView$.unsubscribe();
  }

  showChatAI() {
    // if (this.isDragging) {
    //   return;
    // }
    if (!this.chatAIInited) {
      this.chatAIInited = true;
    } else {
      this.iframeRef.nativeElement.contentWindow.postMessage('show-chat-panel');
    }
    this.chatAIShown = true;
    this.showBtn = false;
  }

  isDescendant(element: Element, ancestor: Element) {
    while (element) {
      if (element === ancestor) {
        return true;
      }
      element = element.parentElement;
    }
    return false;
  }

  insertToBody() {
    this.element = document.getElementById('chatContainer');
    const body = document.querySelector('body');
    body.insertBefore(this.element, body.firstChild);
  }

  handleShowDrawer(visible?: boolean) {
    if (!visible) {
      this.showSettingDrawer = !this.showSettingDrawer;
    } else {
      this.showSettingDrawer = visible;
    }

    // if (this.currentView.iframeElement) {
    //   this.currentView.iframeElement.postMessage({name: 'OPEN'}, '*');
    // }
  }

  isDifferenceWithinThreshold(num1, num2, threshold = 5) {
    const difference = Math.abs(num1 - num2);
    return difference <= threshold;
  }

  toggle() {
    this.showBtn = !this.showBtn;
  }
}
