import {Component, Inject, OnInit} from '@angular/core';
import {Asset, ConnectData, ConnectionToken} from '@app/model';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {I18nService} from '@app/services/i18n';
import {HttpService} from '@app/services/http';
import {ToastrService} from 'ngx-toastr';
import {HttpErrorResponse} from '@angular/common/http';
import {DomSanitizer, SafeResourceUrl} from '@angular/platform-browser';


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
  public error: HttpErrorResponse;
  public otherError: string;
  public ticketAssignees: string = '-';
  // Token 的行为，创建或者兑换 Token, create, exchange
  public tokenAction: string = 'create';
  public tokenID: string;
  private timerCheckTicket: number;

  public faceVerifyUrl: SafeResourceUrl;


  constructor(public dialogRef: MatDialogRef<ElementACLDialogComponent>,
              private _i18n: I18nService,
              private _toastr: ToastrService,
              private _http: HttpService,
              private sanitizer: DomSanitizer,
              @Inject(MAT_DIALOG_DATA) public data: any
  ) {
  }

  get ticketDetailPageURL(): string {
    return this.connectionToken.from_ticket_info.ticket_detail_page_url;
  }

  get errorDetail() {
    let error = this.data.error.error;
    if (Array.isArray(error)) {
      error = error.join(' ');
    } else if (typeof error === 'object') {
      error = JSON.stringify(error);
    }
    return error;
  }

  ngOnInit() {
    // 创建 Token 的时候，需要传入 Asset 和 ConnectInfo
    this.asset = this.data.asset;
    this.connectInfo = this.data.connectInfo;
    this.code = this.data.code;
    // 兑换 Token 的时候，需要传入 Token ID
    this.tokenID = this.data.tokenID;
    // 控制 token 的行为, 创建还是兑换
    this.tokenAction = this.data.tokenAction;
  }

  async onCopySuccess(evt) {
    const msg = await this._i18n.t('Copied');
    this._toastr.success(msg);
  }

  onCancelReview() {
    this.closeDialog();
  }

  onConfirmFaceVerify() {
    const successCallback = (connToken: ConnectionToken) => {
      if (connToken && connToken.face_token) {
        this.faceVerifyUrl = this.sanitizer.bypassSecurityTrustResourceUrl('/facelive/capture?token=' + connToken.face_token);
        this.code = 'face_verify_capture';

        const timer = setInterval(() => {
          this._http.getFaceVerifyState(connToken.face_token).subscribe(async (data) => {
            if (data.is_finished) {
              clearInterval(timer);
              if (!data.success) {
                this.code = 'other';
                this.otherError = data.error_message;
              } else {
                const msg = await this._i18n.t('Face verify success');
                this._toastr.success(msg);
                this.dialogRef.close(connToken);
              }
            }
          });
        }, 1000);
      }
    };
    const errorCallback = (error) => {
      if (error.error.code === 'no_face_feature') {
        this.code = error.error.code;
      } else {
        this.code = 'other';
        this.otherError = error.error.detail;
      }
    };
    this._http.createConnectToken(this.asset, this.connectInfo, false, true).subscribe(successCallback, errorCallback);
  }

  onCancelFaceVerify() {
    this.closeDialog();
  }


  onConfirmReview() {
    const successCallback = (connToken: ConnectionToken) => {
      if (connToken && connToken.from_ticket) {
        this.connectionToken = connToken;
        this.code = 'ticket_review_pending';
        this.checkTicket();
      }
    };
    const errorCallback = (error) => {
      if (error.error.code.startsWith('acl_')) {
        this.code = error.error.code;
      } else {
        this.code = 'other';
        this.otherError = error.error.detail;
      }
    };
    if (this.tokenAction === 'exchange') {
      this._http.exchangeConnectToken(this.tokenID, true).subscribe(successCallback, errorCallback);
    } else {
      this._http.createConnectToken(this.asset, this.connectInfo, true).subscribe(successCallback, errorCallback);
    }
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
