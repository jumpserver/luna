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
    this.init();
  }

  async init() {
    const cookieOrg = this._cookie.get('X-JMS-ORG');
    await this._organizationSvc.user.subscribe(user => {
      this.organizations = user.workbench_orgs || [];
      const defaultOrganization = this.organizations.find(i => i.id === cookieOrg);
      this.selectedOrganization = defaultOrganization || user.workbench_orgs[0] || {};
      this._cookie.set('X-JMS-ORG', this.selectedOrganization.id, 3600, '/', document.domain, true, 'Lax');
      this._organizationSvc.onSwitchOrganizationHandle();
    });
  }

  selectHandleChange(event) {
    this.selectedOrganization = event.value;
    console.log('SEt cookie to: ', event.value.id);
    this._cookie.set('X-JMS-ORG', event.value.id, 3600, '/', document.domain, true, 'Lax');
    this._organizationSvc.onSwitchOrganizationHandle();
    this.clearAllSearchInput.emit();
  }
}
