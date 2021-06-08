import {Injectable} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {LogService} from '@app/services/share';
import {CookieService} from 'ngx-cookie-service';

@Injectable()
export class I18nService {
  LANG_COOKIE_NAME = 'django_language';
  SUPPORTED_LANG_CODES = ['en', 'zh'];

  constructor(
    private _translate: TranslateService,
    private _logger: LogService,
    private _cookie: CookieService
  ) {
    this._logger.debug('Get cookie django_language: ', this._cookie.get(this.LANG_COOKIE_NAME));
    this.initialLang();
  }

  getLangCode() {
    let langCode = this._cookie.get(this.LANG_COOKIE_NAME);
    if (!langCode) {
      langCode = navigator.language;
    }
    if (langCode.indexOf('en') > -1) {
      return 'en';
    } else {
      return 'zh';
    }
  }

  public initialLang() {
    // 语言初始化(若未设置语言, 则取浏览器语言)
    const currentLanguage = this.getLangCode();
    this._translate.setDefaultLang('zh');
    this._translate.use(currentLanguage);

    this._logger.debug('Lang is: ', currentLanguage);
    // 记录当前设置的语言
  }

  t(key): Promise<string> {
    return this._translate.get(key).toPromise();
  }

  get(key): Promise<string> {
    return this._translate.get(key).toPromise();
  }

  instant(key): string {
    return this._translate.instant(key);
  }

  use(lang) {
    this._translate.use(lang);
    if (lang.indexOf('en') > -1) {
      this._cookie.set('django_language', 'en', 3600, '/', '', true, 'Lax');
    } else {
      this._cookie.set('django_language', 'zh-hans', 3600, '/', '', true, 'Lax');
    }
  }
}
