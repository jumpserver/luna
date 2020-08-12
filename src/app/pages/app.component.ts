import {Component} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {AppService} from '@app/services';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})

export class AppComponent {

  constructor(private appSrv: AppService, public translate: TranslateService) {
  }
  // tslint:disable-next-line:use-life-cycle-interface
  public async ngOnInit() {
    // 语言初始化(若未设置语言, 则取浏览器语言)
    const currentLanguage = await localStorage.getItem('currentLanguage') || this.translate.getBrowserCultureLang();
    // 当在assets/i18n中找不到对应的语言翻译时，使用'zh-CN'作为默认语言
    this.translate.setDefaultLang('zh');
    this.translate.use(currentLanguage);
    // 记录当前设置的语言
    localStorage.setItem('currentLanguage', currentLanguage);
  }

}

