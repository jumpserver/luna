import {Component, OnDestroy, OnInit} from '@angular/core';
import {SettingService, ViewService} from '@app/services';
import {View} from '@app/model';

@Component({
  selector: 'elements-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})

export class ElementChatComponent implements OnInit, OnDestroy {
  isShow = true;
  element: any;
  iframeURL: string;
  currentView: View;
  private isLongPress: boolean;
  private longPressTimeout: number;
  private isDragging: boolean;

  constructor(
    public viewSrv: ViewService,
    public _settingSvc: SettingService
  ) {
  }

  get isShowSetting() {
    const connectMethods = ['koko', 'lion', 'tinker', 'panda'];
    return (
      this.currentView.hasOwnProperty('connectMethod')
      && connectMethods.includes(this.currentView.connectMethod.component)
    );
  }

  get subViews() {
    return this.currentView.hasOwnProperty('subViews') ? this.currentView.subViews : [];
  }

  get chatAiEnabled() {
    return this._settingSvc.globalSetting.CHAT_AI_ENABLED;
  }

  ngOnInit() {
    this.viewSrv.currentView$.subscribe((state: View) => {
      this.currentView = state;
    });
    this.iframeURL = '/ui/#/chat/chat-ai';
    this.init();
    this.insertToBody();
  }

  ngOnDestroy() {
    this.element.remove();
    this.viewSrv.currentView$.unsubscribe();
  }

  init() {
    const clientOffset: any = {};
    const dragBox = document.getElementById('dragBox');
    const dragButton = document.querySelector('.drag-button');
    const chatImg = dragButton.querySelector('.chat-img');
    const elements = [dragButton, chatImg];

    elements.forEach(element => {
      element.addEventListener('mousedown', (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        const offsetY = dragBox.getBoundingClientRect().top;
        const innerY = event.clientY - offsetY;

        clientOffset.clientY = event.clientY;
        this.isLongPress = false;

        this.longPressTimeout = setTimeout(() => {
          this.isLongPress = true;
          document.onmousemove = (ev: MouseEvent) => {
            if (!this.isLongPress) { return; }

            let newTop = ev.clientY - innerY;

            // 确保 dragBox 在窗口可视范围内
            const dragDivTop = window.innerHeight - dragBox.offsetHeight;

            if (newTop < 0) { newTop = 0; }
            if (newTop > dragDivTop) { newTop = dragDivTop; }

            dragBox.style.top = newTop + 'px';
            dragBox.style.left = '-48px';

            ev.preventDefault();
            ev.stopPropagation();
          };
        }, 300); // 300ms 作为长按检测时间

        document.onmouseup = () => {
          document.onmousemove = null;
          document.onmouseup = null;

          if (!this.isLongPress) {
            clearTimeout(this.longPressTimeout); // 确保清除长按检测
            this.isShow = !this.isShow;
          }

          setTimeout(() => {
            this.isLongPress = false;
          }, 500);
        };
      }, false);

      element.addEventListener('mouseup', (event: MouseEvent) => {
        const clientY = event.clientY;
        if (
          this.isDifferenceWithinThreshold(clientY, clientOffset.clientY)
          && (event.target === dragButton || this.isDescendant(event.target as Element, dragButton))
        ) {
          this.isShow = !this.isShow;
        }
        setTimeout(() => {
          this.isDragging = false;
        }, 500);
      });
    });
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

  onSettingOpenDrawer() {
    this.currentView.iframeElement.postMessage({name: 'OPEN'}, '*');
  }

  isDifferenceWithinThreshold(num1, num2, threshold = 5) {
    const difference = Math.abs(num1 - num2);
    return difference <= threshold;
  }

  toggle() {
    this.isShow = !this.isShow;
  }
}
