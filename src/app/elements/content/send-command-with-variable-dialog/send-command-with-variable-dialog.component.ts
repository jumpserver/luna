import {Component, Input, OnInit} from '@angular/core';
import {HttpService} from '@app/services';
import {NzModalRef} from 'ng-zorro-antd';

@Component({
  selector: 'elements-send-with-variable-command-dialog',
  templateUrl: './send-command-with-variable-dialog.component.html',
})
export class ElementSendCommandWithVariableDialogComponent implements OnInit {
  public formConfig = [];
  @Input() public command = {id: ''};

  constructor(private _http: HttpService,
              private _dialogRef: NzModalRef<ElementSendCommandWithVariableDialogComponent>,
  ) {
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

  protected readonly Component = Component;
}
