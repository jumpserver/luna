import {Component} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {AppService} from '@app/services';
import {CookieService} from 'ngx-cookie-service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})

export class AppComponent {
  LANG_COOKIE_NAME = 'django_language';
  SUPPORTED_LANG_CODES = ['en', 'zh'];
  constructor(private appSrv: AppService, public translate: TranslateService, private _cookie: CookieService) {
  }

  getLangCode() {
    let langCode = this._cookie.get(this.LANG_COOKIE_NAME);
    if (!langCode) {
      langCode = navigator.language;
    }
    langCode = langCode.substr(0, 2);
    langCode = langCode.replace('zh', 'cn');
    if (langCode && this.SUPPORTED_LANG_CODES.indexOf(langCode) !== -1) {
      return langCode;
    }
  }

  // tslint:disable-next-line:use-life-cycle-interface
  public async ngOnInit() {
    // 语言初始化(若未设置语言, 则取浏览器语言)
    let currentLanguage = this.getLangCode();
    if (!currentLanguage) {
      currentLanguage = 'zh';
    }
    this.translate.setDefaultLang('zh');
    this.translate.use(currentLanguage);
    // 记录当前设置的语言
  }
}

