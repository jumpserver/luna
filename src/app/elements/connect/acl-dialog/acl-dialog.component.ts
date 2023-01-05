import {Component, Inject, OnInit} from '@angular/core';
import {Asset, ConnectData, ConnectionToken} from '@app/model';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';

@Component({
  selector: 'elements-acl-dialog',
  templateUrl: './acl-dialog.component.html',
  styleUrls: ['./acl-dialog.component.scss']
})
export class ElementACLDialogComponent implements OnInit {

  public asset: Asset;

  public connectInfo: ConnectData;

  // acl_reject, acl_review
  public code: string;

  public connectionToken: ConnectionToken = null;

  constructor( public dialogRef: MatDialogRef<ElementACLDialogComponent>,
               @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit() {
    this.asset = this.data.asset;
    this.connectInfo = this.data.connectInfo;
    this.code = this.data.code;
  }

  onCancelReview() {
    this.closeDialog();
  }

  onConfirmReview() {
    this.closeDialog();
  }

  onCancelConnect() {
    this.closeDialog();
  }

  onConfirmConnect() {
    this.closeDialog();
  }

  closeDialog() {
    this.dialogRef.close(this.connectionToken);
  }

}
