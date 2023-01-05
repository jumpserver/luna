import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA} from '@angular/material';
import {Asset, CreateConnectTokenEvt, PerformConnectEvt, ConnectionToken} from '@app/model';
import {createConnectTokenEvt, performConnectEvt} from '@app/globals';
import {ConnectData} from '@app/model';
import {MatDialogRef} from '@angular/material/dialog';
import {HttpService} from '@app/services';

@Component({
  selector: 'app-review-dialog',
  templateUrl: './review-dialog.component.html',
  styleUrls: ['./review-dialog.component.scss']
})
export class ElementReviewDialogComponent implements OnInit {
  public asset: Asset;

  // review, reject, pending, close
  public state: string;

  public connectInfo: ConnectData;

  public connectionToken: ConnectionToken;

  constructor(public dialogRef: MatDialogRef<ElementReviewDialogComponent>,
              private _http: HttpService,
              @Inject(MAT_DIALOG_DATA) public data: any) { }

  ngOnInit() {
    this.asset = this.data.asset;
    this.connectInfo = this.data.connectInfo;
    this.connectionToken = this.data.connectionToken;
    this.state = this.data.state;
    if (this.state === 'pending') {
      this.checkTicket();
    }
  }

  closeDialog() {
    this.dialogRef.close();
  }

  onContinueReview() {
    console.log('>>>>>>>>> review dialog', this.asset, this.connectInfo);
    const evt = new CreateConnectTokenEvt(this.asset, this.connectInfo, true);
    createConnectTokenEvt.next(evt);
    this.closeDialog();
  }

  onCancelWait() {
    this.closeTicket();
    this.closeDialog();
  }

  onCancelConnect() {
    this.closeTicket();
    this.closeDialog();
  }

  onConfirmConnect() {
    const evt = new PerformConnectEvt(this.asset, this.connectInfo, this.connectionToken);
    performConnectEvt.next(evt);
    this.closeDialog();
  }

  checkTicket() {
    const timer = setInterval(() => {
      this._http.checkConnectTokenTicket(this.connectionToken).subscribe(
        res => {
          this.state = 'approve';
          clearInterval(timer);
        },
        err => {
          this.state = err.error.code;
          if (['closed', 'rejected'].includes(this.state)) {
            clearInterval(timer);
          }
        }
      );
    }, 5000);
  }

  closeTicket() {
    this._http.closeTicket(this.connectionToken.from_ticket.id).subscribe();
  }

}
