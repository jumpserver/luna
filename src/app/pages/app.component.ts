import {Component, OnInit} from '@angular/core';
import {I18nService} from '@app/services';
import { EventManager } from '@angular/platform-browser';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})

export class AppComponent implements OnInit {
  constructor(_i18n: I18nService,
              private eventManager: EventManager
  ) {}
  ngOnInit(): void {
    this.eventManager.addGlobalEventListener('window', 'keyup.esc', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    });
  }
}

