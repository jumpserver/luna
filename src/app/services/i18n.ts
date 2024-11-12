import {Injectable} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {LogService} from '@app/services/share';
import {CookieService} from 'ngx-cookie-service';

@Injectable()
export class I18nService {
  LANG_COOKIE_NAME = 'django_language';
  SUPPORTED_LANG_CODES = ['en', 'zh', 'ja', 'zh-hant'];

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
      langCode = navigator.language.toLowerCase();
    }
    if (['zh', 'zh-cn'].includes(langCode)) {
      return 'zh';
    }  else if (langCode.indexOf('zh-') > -1) {
      // zh-hant zh-tw zh-hk
      return 'zh-hant';
    } else if (langCode.indexOf('ja') > -1) {
      return 'ja';
    } else {
      return 'en';
    }
  }

  public initialLang() {
    // 语言初始化(若未设置语言, 则取浏览器语言)
    const currentLanguage = this.getLangCode();
    this._translate.setDefaultLang('en');
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
    let useLang;
    this._translate.use(lang);
    if (lang.indexOf('en') > -1) {
      useLang = 'en';
    } else if (lang.indexOf('ja') > -1) {
      useLang = 'ja';
    } else if (lang.indexOf('zh-hant') > -1) {
      useLang = 'zh-hant';
    } else {
      useLang = 'zh-hans';
    }
    this._cookie.set('django_language', useLang, 365, '/');
  }
}
