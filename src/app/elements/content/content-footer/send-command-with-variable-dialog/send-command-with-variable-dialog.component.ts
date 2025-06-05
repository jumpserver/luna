import {Component, Inject, OnInit} from '@angular/core';
import {HttpService} from '@app/services';
import {NZ_MODAL_DATA, NzModalRef} from 'ng-zorro-antd/modal';

@Component({
  standalone: false,
  selector: 'elements-send-with-variable-command-dialog',
  templateUrl: 'send-command-with-variable-dialog.component.html',
})
export class ElementSendCommandWithVariableDialogComponent implements OnInit {
  public formConfig = [];
  public command = {id: ''};
  protected readonly Component = Component;

  constructor(private _http: HttpService,
              @Inject(NZ_MODAL_DATA) public data: any,
              private _dialogRef: NzModalRef<ElementSendCommandWithVariableDialogComponent>,
  ) {
    this.command = this.data.command;
  }

  ngOnInit() {
    this.getVariableFormMeta();
  }

  async getVariableFormMeta() {
    const adhoc = this.command.id;
    const url = `/api/v1/ops/variables/form-data/?t=${new Date().getTime()}&adhoc=${adhoc}`;
    const res: any = await this._http.options(url).toPromise();
    this.formConfig = res.actions.GET;
  }

  onFormSubmitted(data: any) {
    setTimeout(() => {
      this._dialogRef.close(data.sendCommand);
    });
  }
}
