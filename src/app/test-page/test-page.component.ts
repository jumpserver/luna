import {Component, OnInit} from '@angular/core';
import {DataStore} from '../globals';
import {DialogService} from '../elements/dialog/dialog.service';

// import {Mats, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material';

@Component({
  selector: 'app-test-page',
  templateUrl: './test-page.component.html',
  styleUrls: ['./test-page.component.scss']
})
export class TestPageComponent implements OnInit {

  constructor(private _dialog: DialogService) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    this._dialog.alert();
  }

}
