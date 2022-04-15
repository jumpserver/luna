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
  selectedOrganization: OrganizationItem = {};
  organizations = [];

  constructor(private _http: HttpService,
              private _cookie: CookieService,
              private _organizationSvc: OrganizationService) {}

  ngOnInit() {
    this.init();
  }

  init() {
    const org = this._cookie.get('X-JMS-ORG');
    this._http.getUserProfile().subscribe(
      user => {
        this.organizations = user.myorgs || [];
        const defaultOrganization = this.organizations.find(i => i.id === org);
        this.selectedOrganization = defaultOrganization || user.myorgs[0] || {};
      }
    );
  }

  selectHandleChange(event) {
    this.selectedOrganization = event.value;
    console.log('SEt cookie to: ', event.value.id);
    this._cookie.set('X-JMS-ORG', event.value.id, 3600, '/', document.domain, true, 'Lax');
    this._organizationSvc.onSwitchOrganizationHandle();
  }
}
