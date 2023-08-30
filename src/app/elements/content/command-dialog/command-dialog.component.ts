import {Component, Inject, OnInit} from '@angular/core';
import {MatDialogRef} from '@angular/material';
import {HttpService} from '@app/services';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';

@Component({
  selector: 'elements-command-dialog',
  templateUrl: './command-dialog.component.html',
})
export class ElementCommandDialogComponent implements OnInit {
  public name = '';

  constructor(public dialogRef: MatDialogRef<ElementCommandDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any,
              private _http: HttpService,
  ) {}

  ngOnInit() {}

  async onSubmit() {
    if (!this.name) { return; }
    const data = {
      name: this.name,
      args: this.data.command,
      module: 'shell',
    };
    this._http.addQuickCommand(data).subscribe(
      () => {},
      (error) => {
        const msg = 'name:' + error.error.name;
        alert(msg);
      }
    );
    this.dialogRef.close();
  }
}
