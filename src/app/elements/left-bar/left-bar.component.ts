import { Component, EventEmitter, OnInit, Output } from "@angular/core";
import { DataStore } from "@app/globals";
import { version } from "@src/environments/environment";
import { OrganizationService, SettingService } from "@app/services";
import _ from "lodash-es";

@Component({
  standalone: false,
  selector: "elements-left-bar",
  templateUrl: "left-bar.component.html",
  styleUrls: ["left-bar.component.scss"],
})
export class ElementLeftBarComponent implements OnInit {
  @Output() menuCollapsedToggle: EventEmitter<boolean> = new EventEmitter();
  showTree = true;
  version = version;
  collapsed = false;
  menus: any[] = [];
  hasXPack: boolean = localStorage.getItem("hasXPack") === "1";

  constructor(
    public _settingSvc: SettingService,
    private _orgSvc: OrganizationService
  ) {
    this.onOrgChangeReloadTree();
  }

  ngOnInit() {
    this.menus = [
      {
        name: "assets",
        icon: "fa-inbox",
        click: () => this.menuClick(),
      },
      {
        name: "applications",
        icon: "fa-th",
        click: () => this.menuClick(),
      },
    ];
    this.onResize(window);
    window.addEventListener("resize", _.debounce(this.onResize, 300));
    this._settingSvc.afterInited().then(() => {
      this.hasXPack = this._settingSvc.hasXPack();
      localStorage.setItem("hasXPack", this.hasXPack ? "1" : "0");
      console.log("hasXPack", this.hasXPack);
    });
  }

  onResize(event) {
    const width = event.currentTarget
      ? event.currentTarget.innerWidth
      : event.innerWidth;
    if (width < 768) {
      this.isMobile = true;
      // this.overlayMenu = true;
    } else {
      this.isMobile = false;
    }
  }

  menuClick(settings = null) {
    this.toggle();
  }

  onToggleMobileLayout() {
    if (this.isMobile) {
      // this.overlayMenu = !this.overlayMenu;
    }
  }

  _isMobile = false;

  get isMobile() {
    return this._isMobile;
  }

  set isMobile(value) {
    // this._isMobile = value;
    // let settings: any = {};
    // if (!value) {
    //   settings = this.settingLayoutSize;
    //   this.collapsed = true;
    // } else {
    //   settings.leftWidth = '100';
    //   settings.rightWidth = '0';
    //   this.collapsed = false;
    // }
    // setTimeout(() => {
    //   this.menuClick(settings);
    // }, 10);
  }

  static Hide() {
    DataStore.showLeftBar = false;
    window.dispatchEvent(new Event("resize"));
  }

  static Show() {
    DataStore.showLeftBar = true;
    window.dispatchEvent(new Event("resize"));
  }

  onOrgChangeReloadTree() {
    this._orgSvc.currentOrgChange$.subscribe(() => {
      this.showTree = false;
      setTimeout(() => (this.showTree = true), 100);
    });
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this.menuCollapsedToggle.emit(this.collapsed);
    // this.menuClick();
  }
}
