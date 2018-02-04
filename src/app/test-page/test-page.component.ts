import {Component, Inject, OnInit} from '@angular/core';
import {DataStore} from '../globals';
import {DialogService} from '../elements/dialog/dialog.service';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';

// import {Mats, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material';

@Component({
  selector: 'app-test-page',
  templateUrl: './test-page.component.html',
  styleUrls: ['./test-page.component.scss']
})
export class TestPageComponent implements OnInit {
  name: string;

  constructor(private _dialog: MatDialog) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    this.name = 'ssss';
  }

  openDialog(): void {
    const dialogRef = this._dialog.open(TestPageComponentDialog, {
      width: '251px',
      data: {name: this.name}
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed', result);
      // this.animal = result;
    });
  }
}


@Component({
  selector: 'app-test-page-dialog',
  templateUrl: 'dialog.html',
})
export class TestPageComponentDialog {
  constructor(public dialogRef: MatDialogRef<TestPageComponentDialog>,
              @Inject(MAT_DIALOG_DATA) public data: any) {
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

}
