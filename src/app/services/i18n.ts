import {Injectable} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';

@Injectable()
export class I18nService {

  constructor(private _translate: TranslateService) {}

  t(key): Promise<string> {
    return this._translate.get(key).toPromise();
  }
}
