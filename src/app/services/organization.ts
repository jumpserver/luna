import {EventEmitter, Injectable} from '@angular/core';
import {Subject, Observable} from 'rxjs';
import {CookieService} from 'ngx-cookie-service';

@Injectable()
export class OrganizationService {
  onProfile: EventEmitter<object> = new EventEmitter<object>();
  private _change: Subject<any> = new Subject<any>();

  constructor(private _cookie: CookieService) {}

  public switchOrganization(org): void {
    this._cookie.set('X-JMS-ORG', org.id, 3600, '/', document.domain, true, 'Lax');
    this._change.next();
  }

  public emitSwitchOrganizationHandle(): Observable<any> {
    return this._change.asObservable();
  }
}
