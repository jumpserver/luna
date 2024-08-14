import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { View, ViewAction } from '@app/model';

@Component({
  selector: 'elements-content-tab',
  templateUrl: './content-tab.component.html',
  styleUrls: ['./content-tab.component.scss'],
})
export class ElementContentTabComponent implements OnInit {
  @Input() view: View;
  @Output() onAction: EventEmitter<ViewAction> = new EventEmitter<ViewAction>();
  @ViewChild('inputElement', { static: false }) inputElement: ElementRef;

  public iconCls: string;
  private shouldFocusInput = false;
  private clickTimeout: any;

  ngOnInit(): void {
    if (!this.view.asset) {
      this.iconCls = 'fa-linux';
    } else {
      this.iconCls = 'fa-' + this.view.asset.type.value;
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
    }, 300);
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
}
