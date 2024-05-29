import {Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {SettingService, ViewService} from '@app/services';
import {View} from '@app/model';

@Component({
  selector: 'elements-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})

export class ElementChatComponent implements OnInit, OnDestroy {
  @ViewChild('contentWindow', {static: false}) iframeRef: ElementRef;
  showBtn = true;
  element: any;
  iframeURL: string;
  currentView: View;
  chatAIShown = false;
  chatAIInited = false;
  isDragging = false;

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

  get hasChatContainer() {
    return;
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
    this.iframeURL = '/ui/#/chat/chat-ai?from=luna';
    this.addDragBtn();
    this.insertToBody();
    window.addEventListener('message', (event) => {
      // 确认消息的来源是你信任的域
      if (event.data === 'close-chat-panel') {
        this.chatAIShown = false;
        this.showBtn = !this.showBtn;
        console.log('Received message from iframe:', event.data);
      }
    });
  }

  ngOnDestroy() {
    this.element.remove();
    this.viewSrv.currentView$.unsubscribe();
  }

  showChatAI() {
    if (this.isDragging) {
      return;
    }
    if (!this.chatAIInited) {
      this.chatAIInited = true;
    } else {
      this.iframeRef.nativeElement.contentWindow.postMessage('show-chat-panel');
    }
    this.chatAIShown = true;
    this.showBtn = false;
  }

  addDragBtn() {
    const clientOffset: any = {};
    const dragBox = document.getElementById('dragBox');
    const dragButton = document.querySelector('.robot-button');
    dragBox.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      const offsetY = dragBox.getBoundingClientRect().top;
      const innerY = event.clientY - offsetY;

      clientOffset.clientY = event.clientY;
      const vm = this;
      document.onmousemove = function (ev: any) {
        vm.isDragging = true;
        dragBox.style.top = ev.clientY - innerY + 'px';
        const dragDivTop = window.innerHeight - dragBox.getBoundingClientRect().height;
        if (dragBox.getBoundingClientRect().top <= 10) {
          dragBox.style.top = '10px';
        }
        if (dragBox.getBoundingClientRect().top >= dragDivTop) {
          dragBox.style.top = dragDivTop - 100 + 'px';
        }
        ev.preventDefault();
        ev.stopPropagation();
      };
      document.onmouseup = function () {
        document.onmousemove = null;
        document.onmouseup = null;
      };
    }, false);
    dragBox.addEventListener('mouseup', (event) => {
      const clientY = event.clientY;
      if (
        this.isDifferenceWithinThreshold(clientY, clientOffset.clientY)
        && (event.target === dragButton || this.isDescendant(event.target, dragButton))
      ) {
        this.showBtn = !this.showBtn;
      }
      setTimeout(() => {
        this.isDragging = false;
      }, 500);
    });
  }

  isDescendant(element, ancestor) {
    if (element.parentNode === ancestor) {
      return true;
    }
    return false;
  }

  insertToBody() {
    this.element = document.getElementById('chatContainer');
    const body = document.querySelector('body');
    body.insertBefore(this.element, body.firstChild);
  }

  onSettingOpenDrawer() {
    if (this.currentView.iframeElement) {
      this.currentView.iframeElement.postMessage({name: 'OPEN'}, '*');
    }
  }

  isDifferenceWithinThreshold(num1, num2, threshold = 5) {
    const difference = Math.abs(num1 - num2);
    return difference <= threshold;
  }

  toggle() {
    this.showBtn = !this.showBtn;
  }
}
