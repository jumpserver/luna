import {Component} from '@angular/core';
import {I18nService} from '@app/services';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})

export class AppComponent {
  constructor(_i18n: I18nService) {
  }
}

