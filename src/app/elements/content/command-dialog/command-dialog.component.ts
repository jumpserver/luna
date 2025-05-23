import {Component, OnInit} from '@angular/core';
import {HttpService, I18nService} from '@app/services';
import {NzModalRef} from 'ng-zorro-antd';

@Component({
  selector: 'elements-command-dialog',
  templateUrl: './command-dialog.component.html',
})
export class ElementCommandDialogComponent implements OnInit {
  public name = '';
  public module = 'shell';
  public commandModules = [
    {
      label: 'Shell',
      value: 'shell'
    }
  ];

  constructor(public dialogRef: NzModalRef<ElementCommandDialogComponent>,
              private _http: HttpService,
              private _i18n: I18nService,
  ) {
  }

  ngOnInit() {
  }

  async onSubmit() {
    if (!this.name) {
      return;
    }
    const data = {
      name: this.name,
      args: this.data.command,
      module: this.module,
    };
    this._http.addQuickCommand(data).subscribe(
      async () => {
        const msg = await this._i18n.t('Save success');
        this.snackBar.open(msg, '', {
          verticalPosition: 'top',
          duration: 1600
        });
        this.dialogRef.close();
      },
      (error) => {
        const msg = 'name:' + error.error.name;
        this.snackBar.open(msg, '', {
          verticalPosition: 'top',
          duration: 1600
        });
      }
    );
  }
}
