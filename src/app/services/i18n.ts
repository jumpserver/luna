import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LogService } from '@app/services/share';
import { CookieService } from 'ngx-cookie-service';

@Injectable()
export class I18nService {
  LANG_COOKIE_NAME = 'django_language';

  constructor(
    private _translate: TranslateService,
    private _logger: LogService,
    private _cookie: CookieService
  ) {
    this._logger.debug('Get cookie django_language: ', this._cookie.get(this.LANG_COOKIE_NAME));
    this.initialLang();
  }

  getLangCode() {
    return this._cookie.get(this.LANG_COOKIE_NAME) || navigator.language.toLowerCase();
  }

  public initialLang() {
    // 语言初始化(若未设置语言, 则取浏览器语言)
    const lang = this.getLangCode();
    this._translate.use(lang);
    this._logger.debug('Lang is: ', lang);
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
    this._cookie.set(this.LANG_COOKIE_NAME, lang, 365, '/');
  }
}
