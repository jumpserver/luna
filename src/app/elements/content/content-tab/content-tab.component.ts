import {Component, OnInit, Input, Output, EventEmitter} from '@angular/core';
import {View, ViewAction} from '@app/model';

@Component({
  selector: 'elements-content-tab',
  templateUrl: './content-tab.component.html',
  styleUrls: ['./content-tab.component.css'],
})
export class ElementContentTabComponent implements OnInit {
  @Input() view: View;
  @Output() onAction: EventEmitter<ViewAction> = new EventEmitter<ViewAction>();
  public iconCls: string;

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
    const action = new ViewAction(this.view, 'active');
    this.onAction.emit(action);
  }
}
