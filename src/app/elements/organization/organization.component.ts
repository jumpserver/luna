import {Component, OnInit, Output, EventEmitter} from '@angular/core';
import {CookieService} from 'ngx-cookie-service';
import {HttpService, OrganizationService} from '@app/services';

interface OrganizationItem {
  id?: string;
  name?: string;
}

@Component({
  selector: 'elements-organization',
  templateUrl: './organization.component.html',
  styleUrls: ['./organization.component.scss'],
})
export class ElementOrganizationComponent implements OnInit {
  @Output() private outer = new EventEmitter();
  @Output() private clearAllSearchInput = new EventEmitter();

  selectedOrganization: OrganizationItem = {};
  organizations = [];

  constructor(private _http: HttpService,
              private _cookie: CookieService,
              private _organizationSvc: OrganizationService) {}

  ngOnInit() {
    const cookieOrg = this._cookie.get('X-JMS-ORG');
    this._organizationSvc.onProfile.subscribe(user => {
      this.organizations = user.workbench_orgs || [];
      const defaultOrganization = this.organizations.find(i => i.id === cookieOrg);
      this.selectedOrganization = defaultOrganization || user.workbench_orgs[0] || {};
      if (!defaultOrganization) {
        this._organizationSvc.switchOrganization(this.selectedOrganization);
      }
    });
  }

  changeOrganization(event) {
    this.selectedOrganization = event.value;
    this._organizationSvc.switchOrganization(this.selectedOrganization);
    this.clearAllSearchInput.emit();
  }
}
