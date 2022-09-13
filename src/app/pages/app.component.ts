import {Component, HostListener} from '@angular/core';
import {I18nService, ViewService} from '@app/services';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})

export class AppComponent {
  constructor(_i18n: I18nService,
    public viewSrv: ViewService
  ) {}
  @HostListener('window:keydown', ['$event'])
  onKeyPress($event: KeyboardEvent) {
    const condition = this.viewSrv.viewList.length > 1 && $event.shiftKey;
      if (condition && $event.keyCode === 37) {
        this.viewSrv.switchView('left');
      }
      if (condition && $event.keyCode === 39) {
        this.viewSrv.switchView('right');
      }
  }
}

