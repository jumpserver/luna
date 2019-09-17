import {Component, Inject, Injectable, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {LogService} from '@app/services';
import {FormControl, Validators} from '@angular/forms';

// import * as layer from 'layui-layer/src/layer.js';

@Injectable()
export class DialogService {

  constructor(public _dialog: MatDialog) {
  }

  open(options: any) {
    // layer.open(options);
  }

  dialog() {
  }

  confirm() {

  }

  tip() {
  }

  loading() {
  }

  alert(msg: string) {
    this._dialog.open(ElementDialogAlertComponent, {
      height: '200px',
      width: '300px',
      data: {msg: msg}
    });
  }

  close(index: any) {
    // layer.close(index);
  }
}


@Component({
  selector: 'elements-alert',
  templateUrl: 'alert.html',
  styleUrls: ['./alert.scss']
})
export class ElementDialogAlertComponent {

  constructor(public dialogRef: MatDialogRef<ElementDialogAlertComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any,
              private _logger: LogService) {
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
