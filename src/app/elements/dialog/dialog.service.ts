import {Component, Inject, Injectable} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {LogService} from '@app/services';


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

  alert(msg: string, title= 'Tips') {
    this._dialog.open(ElementDialogAlertComponent, {
      height: '200px',
      width: '300px',
      data: {title: title, msg: msg}
    });
  }

  close(index: any) {
    // layer.close(index);
  }
}
