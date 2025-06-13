import { Component, OnDestroy, OnInit } from "@angular/core";
import { CookieService } from "ngx-cookie-service";
import { ActivatedRoute, Router } from "@angular/router";
import { OrganizationService, SettingService } from "@app/services";
import { Organization } from "@app/model";
import { DEFAULT_ORG_ID, ROOT_ORG_ID } from "@app/globals";

@Component({
  standalone: false,
  selector: "elements-organization",
  templateUrl: "organization.component.html",
  styleUrls: ["organization.component.scss"],
})
export class ElementOrganizationComponent implements OnInit, OnDestroy {
  currentOrg: Organization = { id: "", name: "" };
  organizations = [];

  constructor(
    private _cookie: CookieService,
    public _settingSvc: SettingService,
    private _orgSvc: OrganizationService,
    private _router: Router,
    private _route: ActivatedRoute
  ) {}

  ngOnInit() {
    const cookieOrgId =
      this._cookie.get("X-JMS-LUNA-ORG") || this._cookie.get("X-JMS-ORG");
    this._orgSvc.orgListChange$.subscribe((res: Array<Organization>) => {
      this.organizations = res || [];
      const cookieOrg = this.organizations.find((i) => i.id === cookieOrgId);
      if (!cookieOrg) {
        this.currentOrg = this.getPropOrg();
        this._orgSvc.switchOrg(this.currentOrg);
      } else {
        this.currentOrg = cookieOrg;
      }
    });
  }

  ngOnDestroy() {
    this._orgSvc.orgListChange$.unsubscribe();
  }

  getPropOrg() {
    let org = this.organizations.find((item) => item.id === DEFAULT_ORG_ID);
    if (!org) {
      org = this.organizations.filter((item) => item.id !== ROOT_ORG_ID)[0];
    }
    if (!org) {
      org = this.organizations[0];
    }
    return org;
  }

  changeOrg(org: Organization) {
    this._orgSvc.switchOrg(org);
    const query = { ...this._route.snapshot.queryParams };
    delete query["oid"];
    delete query["_"];
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: query,
    });
  }
}
