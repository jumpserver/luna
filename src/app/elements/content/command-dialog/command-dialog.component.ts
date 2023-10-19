import {Component, Inject, OnInit} from '@angular/core';
import {MatDialogRef, MatSnackBar} from '@angular/material';
import {HttpService, I18nService} from '@app/services';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';

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

  constructor(public dialogRef: MatDialogRef<ElementCommandDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any,
              private snackBar: MatSnackBar,
              private _http: HttpService,
              private _i18n: I18nService,
  ) {}

  ngOnInit() {}

  async onSubmit() {
    if (!this.name) { return; }
    const data = {
      name: this.name,
      args: this.data.command,
      module: this.module,
    };
    this._http.addQuickCommand(data).subscribe(
      async () => {
        const msg = await this._i18n.t('Save Success');
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
