import {OnInit, OnDestroy, Component} from '@angular/core';
import {ViewService, SettingService} from '@app/services';
import {View} from '@app/model';

@Component({
  selector: 'elements-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})

export class ElementChatComponent implements OnInit, OnDestroy {
  isShow = true;
  element: any;
  iframeURL: String;
  currentView: View;

  constructor(
    public viewSrv: ViewService,
    public _settingSvc: SettingService
  ) {}

  get isShowSetting() {
    const connectMethods = ['koko', 'lion'];
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
    dragBox.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      const offsetX = dragBox.getBoundingClientRect().left;
      const offsetY = dragBox.getBoundingClientRect().top;
      const innerX = event.clientX - offsetX;
      const innerY = event.clientY - offsetY;

      clientOffset.clientX = event.clientX;
      clientOffset.clientY = event.clientY;
      document.onmousemove = function(ev: any) {
        dragBox.style.left = ev.clientX - innerX + 'px';
        dragBox.style.top = ev.clientY - innerY + 'px';
        const dragDivTop = window.innerHeight - dragBox.getBoundingClientRect().height;
        const dragDivLeft = window.innerWidth - dragBox.getBoundingClientRect().width;
        dragBox.style.left = dragDivLeft + 'px';
        dragBox.style.left = '-48px';
        if (dragBox.getBoundingClientRect().top <= 0) {
          dragBox.style.top = '0px';
        }
        if (dragBox.getBoundingClientRect().top >= dragDivTop) {
          dragBox.style.top = dragDivTop + 'px';
        }
        ev.preventDefault();
        ev.stopPropagation();
      };
      document.onmouseup = function() {
        document.onmousemove = null;
        document.onmouseup = null;
      };
    }, false);
    dragBox.addEventListener('mouseup', (event) => {
      const clientX = event.clientX;
      const clientY = event.clientY;
      if (
          this.isDifferenceWithinThreshold(clientX, clientOffset.clientX)
          && this.isDifferenceWithinThreshold(clientY, clientOffset.clientY)
          && (event.target === dragButton || this.isDescendant(event.target, dragButton))
        ) {
        this.isShow = !this.isShow;
      }
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
