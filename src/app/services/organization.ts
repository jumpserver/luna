import {EventEmitter, Injectable} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {Organization} from '@app/model';

@Injectable()
export class OrganizationService {
  orgListChange$: EventEmitter<void> = new EventEmitter();
  currentOrgChange$: EventEmitter<void> = new EventEmitter();
  workbenchOrgs = [];

  constructor(private _cookie: CookieService) {}

  public switchOrg(org): void {
    this._cookie.set('X-JMS-LUNA-ORG', org.id, 30, '/');
    this.currentOrgChange$.emit();
  }

  setWorkbenchOrgs(orgs: Array<Organization>) {
    this.workbenchOrgs = orgs;
    this.orgListChange$.emit();
  }
}
