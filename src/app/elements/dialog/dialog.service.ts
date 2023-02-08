import {Component, Inject, Injectable} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {I18nService, LogService} from '@app/services';


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

  constructor(public _dialog: MatDialog,
              private _i18n: I18nService,
  ) {
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

  async alert(msg: string, title: string='') {
    if (!title) {
      title = await this._i18n.t('Tips')
    }
    this._dialog.open(ElementDialogAlertComponent, {
      height: 'auto',
      width: '400px',
      data: {title: title, msg: msg}
    });
  }

  close(index: any) {
    // layer.close(index);
  }
}
