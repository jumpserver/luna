import {Component, OnInit, Output, EventEmitter} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {HttpService, OrganizationService} from '@app/services';
import {Organization} from '@app/model';

@Component({
  selector: 'elements-organization',
  templateUrl: './organization.component.html',
  styleUrls: ['./organization.component.scss'],
})
export class ElementOrganizationComponent implements OnInit {
  @Output() private outer = new EventEmitter();

  currentOrg: Organization = {id: '', name: ''};
  organizations = [];

  constructor(private _http: HttpService,
              private _cookie: CookieService,
              private _orgSvc: OrganizationService
  ) {}

  ngOnInit() {
    const cookieOrgId = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');
    this._orgSvc.orgListChange$.subscribe(() => {
      this.organizations = this._orgSvc.workbenchOrgs;
      const cookieOrg = this.organizations.find(i => i.id === cookieOrgId);
      this.currentOrg = cookieOrg || this.organizations[0] || {};
      if (!cookieOrg) {
        this._orgSvc.switchOrg(this.currentOrg);
      }
    });
  }

  changeOrg(event) {
    this.currentOrg = event.value;
    this._orgSvc.switchOrg(this.currentOrg);
  }
}
