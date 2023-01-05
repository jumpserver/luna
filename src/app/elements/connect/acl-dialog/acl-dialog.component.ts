import {Component, Inject, OnInit} from '@angular/core';
import {Asset, ConnectData, ConnectionToken} from '@app/model';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {HttpService} from '@app/services';

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

  public otherError: string;

  private timerCheckTicket: number;

  constructor( public dialogRef: MatDialogRef<ElementACLDialogComponent>,
               private _http: HttpService,
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
    this._http.createConnectToken(this.asset, this.connectInfo, true).subscribe(
      (connToken: ConnectionToken) => {
        if (connToken && !connToken.is_active && connToken.from_ticket) {
          this.connectionToken = connToken;
          this.code = 'ticket_review_pending';
          this.checkTicket();
        }
      },
      (error) => {
        if (error.error.code.startsWith('acl_')) {
          this.code = error.error.code;
        } else {
          this.code = 'other';
          this.otherError = error.error.detail;
        }
      },
    );
  }

  onCancelWait() {
    this._http.closeTicket(this.connectionToken.from_ticket.id).subscribe();
    this.closeDialog();
  }

  onCancelConnect() {
    this.closeDialog();
  }

  onConfirmConnect() {
    this.dialogRef.close(this.connectionToken);
  }

  closeDialog() {
    clearInterval(this.timerCheckTicket);
    this.dialogRef.close(null);
  }

  checkTicket() {
    this.timerCheckTicket = setInterval(() => {
      this._http.getTicketDetail(this.connectionToken.from_ticket.id).subscribe(
        res => {
          const ticketFinished = res.status.value === 'closed';
          if (!ticketFinished) {
            // 工单未结束
            this.code = 'ticket_review_pending';
            return;
          }
          const state = res.state.value;
          if (state === 'approved') {
            this.code = 'ticket_review_approved';
          } else if (state === 'rejected') {
            this.code = 'ticket_review_rejected';
          } else if (state === 'closed') {
            this.code = 'ticket_review_closed';
          }
          clearInterval(this.timerCheckTicket);
        },
        error => {
          this.code = 'other';
          this.otherError = error.error.detail;
          clearInterval(this.timerCheckTicket);
        }
      );
    }, 1000);
  }

}
