import {Component, Inject, OnInit} from '@angular/core';
import {Asset, ConnectData, ConnectionToken} from '@app/model';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {HttpService, I18nService} from '@app/services';
import {ToastrService} from 'ngx-toastr';

@Component({
  selector: 'elements-acl-dialog',
  templateUrl: './acl-dialog.component.html',
  styleUrls: ['./acl-dialog.component.scss']
})
export class ElementACLDialogComponent implements OnInit {
  public asset: Asset;
  public connectInfo: ConnectData;
  public code: string;
  public connectionToken: ConnectionToken = null;
  public otherError: string;
  public ticketAssignees: string = '-';
  private timerCheckTicket: number;

  get ticketID(): string {
    if (this.connectionToken && this.connectionToken.from_ticket) {
      return this.connectionToken.from_ticket.id;
    }
  }

  get ticketDetailURL(): string {
    const url = `/ui/#/tickets/tickets/login-host-confirm/${this.ticketID}`;
    return new URL(url, window.location.origin).href;
  }

  constructor( public dialogRef: MatDialogRef<ElementACLDialogComponent>,
               private _i18n: I18nService,
               private _toastr: ToastrService,
               private _http: HttpService,
               @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit() {
    this.asset = this.data.asset;
    this.connectInfo = this.data.connectInfo;
    this.code = this.data.code;
  }

  async onCopySuccess(evt) {
    const msg = await this._i18n.t('Copied');
    this._toastr.success(msg);
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

  onConfirmConnect() {
    this.dialogRef.close(this.connectionToken);
  }

  closeDialog() {
    clearInterval(this.timerCheckTicket);
    this.dialogRef.close(null);
  }

  checkTicket() {
    this.timerCheckTicket = setInterval(() => {
      this._http.getTicketDetail(this.ticketID).subscribe(
        async ticket => {
          const ticketFinished = ticket.status.value === 'closed';
          if (!ticketFinished) {
            // 工单未结束
            this.ticketAssignees = this.getTicketAssignees(ticket);
            this.code = 'ticket_review_pending';
            return;
          }
          const state = ticket.state.value;
          if (state === 'approved') {
            const msg = await this._i18n.t('Login review approved');
            this._toastr.success(msg);
            this.dialogRef.close(this.connectionToken);
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

  getTicketAssignees(ticket) {
    if (ticket && ticket.process_map.length === 1) {
      return ticket.process_map[0].assignees_display.join(',');
    }
  }

}
