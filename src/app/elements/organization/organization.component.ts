import {Component, OnInit, Output, EventEmitter, OnDestroy} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {OrganizationService} from '@app/services';
import {Organization} from '@app/model';

@Component({
  selector: 'elements-organization',
  templateUrl: './organization.component.html',
  styleUrls: ['./organization.component.scss'],
})
export class ElementOrganizationComponent implements OnInit, OnDestroy {
  currentOrg: Organization = {id: '', name: ''};
  organizations = [];

  constructor(private _cookie: CookieService,
              private _orgSvc: OrganizationService
  ) {}

  ngOnInit() {
    const cookieOrgId = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');
    this._orgSvc.orgListChange$.subscribe(async(res) => {
      this.organizations = res;
      const cookieOrg = await this.organizations.find(i => i.id === cookieOrgId);
      this.currentOrg = cookieOrg || this.organizations[0] || {};
      if (!cookieOrg) {
        this._orgSvc.switchOrg(this.currentOrg);
      }
    });
  }

  ngOnDestroy() {
    this._orgSvc.orgListChange$.unsubscribe();
  }

  changeOrg(event) {
    this.currentOrg = event.value;
    this._orgSvc.switchOrg(this.currentOrg);
  }
}
