import {Component, OnInit} from '@angular/core';
import {SettingService, ViewService} from '@app/services';
import {View} from '@app/model';

@Component({
  selector: 'elements-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})

export class ElementChatComponent implements OnInit {
  element: any;
  iframeURL: string;
  currentView: View;

  constructor(
    public viewSrv: ViewService,
    public _settingSvc: SettingService
  ) {
  }

  get isShowSetting() {
    return true;
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

  onSettingOpenDrawer() {
    this.currentView.iframeElement.postMessage({name: 'OPEN'}, '*');
  }

  ngOnInit() {
    this.viewSrv.currentView$.subscribe((state: View) => {
      this.currentView = state;
    });
    this.iframeURL = '/ui/#/chat/chat-ai';
  }
}
