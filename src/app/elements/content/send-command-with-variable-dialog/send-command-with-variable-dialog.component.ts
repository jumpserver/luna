import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {HttpService} from '@app/services';

@Component({
  selector: 'elements-send-with-variable-command-dialog',
  templateUrl: './send-command-with-variable-dialog.component.html',
})
export class ElementSendCommandWithVariableDialogComponent implements OnInit {
  public formConfig = [];
  public command = {};
  constructor(public dialogRef: MatDialogRef<ElementSendCommandWithVariableDialogComponent>,
              private _http: HttpService,
              @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit() {
    this.getVariableFormMeta()
  }
  async getVariableFormMeta() {
    const adhoc = this.data.command.id
    const url=`/api/v1/ops/variables/form-data/?t=${new Date().getTime()}&adhoc=${adhoc}`
    const res: any = await this._http.options(url).toPromise();
    this.formConfig = res.actions.GET;
    this.command = this.data.command;
  }
  onFormSubmitted(data: any) {
    setTimeout(() => {
      this.dialogRef.close(data.sendCommand);
    });
  }

  protected readonly Component = Component;
}
