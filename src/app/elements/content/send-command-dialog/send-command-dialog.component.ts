import {Component, Inject, OnInit} from '@angular/core';
import {MatDialogRef} from '@angular/material';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';

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

  constructor(public dialogRef: MatDialogRef<ElementSendCommandDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit() {}

  async onSubmit() {
    setTimeout(() => {
      this.dialogRef.close();
    });
    this.data.send(this.value);
  }
}
