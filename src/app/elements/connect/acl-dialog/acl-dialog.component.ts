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

  get ticketDetailPageURL(): string {
    return this.connectionToken.from_ticket_info.ticket_detail_page_url;
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
        if (connToken && connToken.from_ticket) {
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
    const closeMethod = this.connectionToken.from_ticket_info.close_ticket_api.method.toLowerCase();
    const closeURL = this.connectionToken.from_ticket_info.close_ticket_api.url;
    this._http[closeMethod](closeURL).subscribe();
    this.closeDialog();
  }

  closeDialog() {
    clearInterval(this.timerCheckTicket);
    this.dialogRef.close(null);
  }

  checkTicket() {
    const checkMethod = this.connectionToken.from_ticket_info.check_ticket_api.method.toLowerCase();
    const checkURL = this.connectionToken.from_ticket_info.check_ticket_api.url;
    const ticketAssignees = this.connectionToken.from_ticket_info.assignees.join(', ');
    this.timerCheckTicket = setInterval(() => {
      this._http[checkMethod](checkURL).subscribe(
        async ticket => {
          if (ticket.status.value !== 'closed') {
            // 工单未关闭
            this.ticketAssignees = ticketAssignees;
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
          this.otherError = error.error.detail + `(${checkURL})`;
          clearInterval(this.timerCheckTicket);
        }
      );
    }, 3000);
  }
}
