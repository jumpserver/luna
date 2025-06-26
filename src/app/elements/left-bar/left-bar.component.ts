import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { DataStore } from '@app/globals';
import { version } from '@src/environments/environment';
import { OrganizationService, SettingService } from '@app/services';
import _ from 'lodash-es';

@Component({
  standalone: false,
  selector: 'elements-left-bar',
  templateUrl: 'left-bar.component.html',
  styleUrls: ['left-bar.component.scss']
})
export class ElementLeftBarComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() menuCollapsedToggle: EventEmitter<boolean> = new EventEmitter();
  @Input() collapsed: boolean = false;
  private resizeObserver!: ResizeObserver;
  showTree = true;
  version = version;
  menus: any[] = [];
  hasXPack: boolean = localStorage.getItem('hasXPack') === '1';

  constructor(
    public _settingSvc: SettingService,
    private _orgSvc: OrganizationService,
    private el: ElementRef
  ) {
    this.onOrgChangeReloadTree();
  }

  ngOnInit() {
    this.menus = [
      {
        name: 'assets',
        icon: 'fa-inbox',
        click: () => this.menuClick()
      },
      {
        name: 'applications',
        icon: 'fa-th',
        click: () => this.menuClick()
      }
    ];
    this.onResize(window);
    window.addEventListener('resize', _.debounce(this.onResize, 300));
    this._settingSvc.afterInited().then(() => {
      this.hasXPack = this._settingSvc.hasXPack();
      localStorage.setItem('hasXPack', this.hasXPack ? '1' : '0');
    });
  }

  onResize(event) {
    const width = event.currentTarget ? event.currentTarget.innerWidth : event.innerWidth;
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

  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        console.log('Sidebar width changed:', width);
        // 这里你可以触发你需要的逻辑
      }
    });

    this.resizeObserver.observe(this.el.nativeElement);
  }

  ngOnDestroy() {
    this.resizeObserver.disconnect();
  }

  _isMobile = false;

  get isMobile() {
    return this._isMobile;
  }

  set isMobile(value) {
    this._isMobile = value;
  }

  static Hide() {
    DataStore.showLeftBar = false;
    window.dispatchEvent(new Event('resize'));
  }

  static Show() {
    DataStore.showLeftBar = true;
    window.dispatchEvent(new Event('resize'));
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
