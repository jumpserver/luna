import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { View, ViewAction } from '@app/model';

@Component({
  standalone: false,
  selector: 'elements-content-tab',
  templateUrl: 'content-tab.component.html',
  styleUrls: ['content-tab.component.scss']
})
export class ElementContentTabComponent implements OnInit, OnChanges {
  @Input() view: View;
  @Output() onAction: EventEmitter<ViewAction> = new EventEmitter<ViewAction>();
  @ViewChild('inputElement', { static: false }) inputElement: ElementRef;

  public iconCls: string[] = [];
  private shouldFocusInput = false;
  private clickTimeout: any;
  private static faIconCache = new Map<string, boolean>();

  ngOnInit(): void {
    this.updateIconClasses();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.view) {
      this.updateIconClasses();
    }
  }

  close() {
    const action = new ViewAction(this.view, 'close');
    this.onAction.emit(action);
  }

  setActive() {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }

    // 点击时需要额外确定当前是否是在编辑状态
    if (this.view.editable) {
      return;
    }

    // 延迟300毫秒，检查是否有双击事件
    this.clickTimeout = setTimeout(() => {
      const action = new ViewAction(this.view, 'active');
      this.onAction.emit(action);
      this.clickTimeout = null;
    }, 100);
  }

  onDoubleClick() {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }
    this.view.editable = true;
    this.shouldFocusInput = true;
  }

  onBlur() {
    setTimeout(() => {
      this.view.editable = false;
    }, 200);
  }

  private updateIconClasses(): void {
    const iconKey = this.view?.asset?.type?.value || 'linux';
    const faClass = `fa-${iconKey}`;
    const fallbackClass = this.getFallbackIconClass(iconKey);
    const hasFontAwesome = this.hasFontAwesomeIcon(faClass);

    this.iconCls = hasFontAwesome ? ['fa', faClass] : [fallbackClass];
  }

  private getFallbackIconClass(iconKey: string): string {
    const normalizedKey = iconKey || 'linux';
    const overrides: Record<string, string> = {
      general: 'switch_ico_docu',
      website: 'website_ico_docu',
      sqlserver: 'sqlserver_ico_docu',
      postgresql: 'postgresql_ico_docu',
      mysql: 'mysql_ico_docu',
      mariadb: 'mariadb_ico_docu',
      mongodb: 'mongodb_ico_docu',
      webcloud: 'WebCloud_ico_docu',
      web_cloud: 'WebCloud_ico_docu',
      'web-cloud': 'WebCloud_ico_docu'
    };

    return overrides[normalizedKey] || `${normalizedKey}_ico_docu`;
  }

  private hasFontAwesomeIcon(iconClass: string): boolean {
    const cached = ElementContentTabComponent.faIconCache.get(iconClass);
    if (cached !== undefined) {
      return cached;
    }

    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return true;
    }

    const el = document.createElement('i');
    el.className = `view_icon fa ${iconClass}`;
    el.style.position = 'absolute';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);

    const content = window.getComputedStyle(el, '::before').getPropertyValue('content');
    document.body.removeChild(el);

    const normalizedContent = (content || '').replace(/['"]/g, '');
    const hasContent = normalizedContent !== '' && normalizedContent !== 'none' && normalizedContent !== 'normal';
    ElementContentTabComponent.faIconCache.set(iconClass, hasContent);
    return hasContent;
  }
}
