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

  get chatAiEnabled() {
    return this._settingSvc.globalSetting.CHAT_AI_ENABLED;
  }

  ngOnInit() {
    this.viewSrv.currentView$.subscribe((state: View) => {
      this.currentView = state;
    });
    this.iframeURL = '/ui/#/chat/chat-ai';
  }
}
