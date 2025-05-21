import {Component, Inject, OnInit} from '@angular/core';
import {NzModalRef} from 'ng-zorro-antd';

@Component({
  selector: 'elements-send-command-dialog',
  templateUrl: './send-command-dialog.component.html',
})
export class ElementSendCommandDialogComponent implements OnInit {
  public value = 'current';
  public options = [
    {
      label: 'Current session',
      value: 'current'
    },
    {
      label: 'All sessions',
      value: 'all'
    }
  ];

  constructor(public dialogRef: NzModalRef,
  ) {}

  ngOnInit() {}

  async onSubmit() {
    setTimeout(() => {
      this.dialogRef.close();
    });
  }
}
