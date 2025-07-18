import { writeText } from 'clipboard-polyfill';
import { I18nService } from '@app/services/i18n';
import { HttpService } from '@app/services/http';
import { FaceService } from '@app/services/face';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Inject, OnInit } from '@angular/core';
import { Asset, ConnectData, ConnectionToken } from '@app/model';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';

interface DialogAction {
  text: string;
  type?: 'primary' | 'default';
  callback: () => void;
}

interface DialogContent {
  title: string;
  message: string;
  isError?: boolean;
  actions: DialogAction[];
  customContent?: any;
}

@Component({
  standalone: false,
  selector: 'elements-acl-dialog',
  templateUrl: 'acl-dialog.component.html',
  styleUrls: ['acl-dialog.component.scss']
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
  public faceVerifyUrl: SafeResourceUrl;
  content: DialogContent;
  private timerCheckTicket: number;

  constructor(
    @Inject(NZ_MODAL_DATA) public data: any,
    private _i18n: I18nService,
    private _http: HttpService,
    public _dialog: NzModalService,
    private _toastr: NzNotificationService,
    private sanitizer: DomSanitizer,
    private faceService: FaceService,
    public dialogRef: NzModalRef<ElementACLDialogComponent>
  ) {
    this.data = data;
  }

  get ticketDetailPageURL(): string {
    return this.connectionToken.from_ticket_info.ticket_detail_page_url;
  }

  get errorDetail() {
    let error = this.data.error.error;
    if (Array.isArray(error)) {
      error = error.join(' ');
    } else if (typeof error === 'object') {
      if (error.detail) {
        error = error.detail;
      } else {
        error = JSON.stringify(error);
      }
    }
    return error;
  }

  ngOnInit() {
    // 创建 Token 的时候，需要传入 Asset 和 ConnectInfo
    this.content = this.getDialogContent(this.data.code);
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
    this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
    writeText(evt);
  }

  onCancelReview() {
    this.closeDialog();
  }

  onConfirmFaceOnline() {
    const faceMonitorToken = this.faceService.getToken();

    const successCallback = (connToken: ConnectionToken) => {
      if (connToken && connToken.face_token) {
        this.faceVerifyUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
          '/facelive/capture?token=' + connToken.face_token
        );
        this.code = 'face_verify_capture';
        this.content = this.getDialogContent(this.code);


        const timer = setInterval(() => {
          this._http.getFaceVerifyState(connToken.face_token).subscribe(async data => {
            if (data.is_finished) {
              clearInterval(timer);
              if (!data.success) {
                this.code = 'other';
                this.otherError = data.error_message;
                this.content = this.getDialogContent(this.code);
              } else {
                const msg = await this._i18n.t('Face verify success');
                this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
                this.dialogRef.close(connToken);
                this.faceService.openFaceMonitor();
              }
            }
          });
        }, 1000);
      }
    };
    const errorCallback = error => {
      if (error.error.code === 'no_face_feature') {
        this.code = error.error.code;
      } else {
        this.code = 'other';
        this.otherError = error.error.detail;
      }
      this.content = this.getDialogContent(this.code);
    };

    if (this.tokenAction === 'exchange') {
      this._http
        .exchangeConnectToken(this.tokenID, false, true, faceMonitorToken)
        .subscribe(successCallback, errorCallback);
    } else {
      if (this.data.connectData && this.data.connectData.direct) {
        this._http
          .adminConnectToken(this.asset, this.data.connectData, false, true, faceMonitorToken)
          .subscribe(successCallback, errorCallback);
        return;
      }
      this._http
        .createConnectToken(this.asset, this.connectInfo, false, true, faceMonitorToken)
        .subscribe(successCallback, errorCallback);
    }
  }

  onConfirmFaceVerify() {
    const successCallback = (connToken: ConnectionToken) => {
      if (connToken && connToken.face_token) {
        this.faceVerifyUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
          '/facelive/capture?token=' + connToken.face_token
        );
        this.code = 'face_verify_capture';
        this.content = this.getDialogContent(this.code);

        const timer = setInterval(() => {
          this._http.getFaceVerifyState(connToken.face_token).subscribe(async data => {
            if (data.is_finished) {
              clearInterval(timer);
              if (!data.success) {
                this.code = 'other';
                this.otherError = data.error_message;
                this.content = this.getDialogContent(this.code);
              } else {
                const msg = await this._i18n.t('Face verify success');
                this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
                this.dialogRef.close(connToken);
              }
            }
          });
        }, 1000);
      }
    };
    const errorCallback = error => {
      if (error.error.code === 'no_face_feature') {
        this.code = error.error.code;
      } else {
        this.code = 'other';
        this.otherError = error.error.detail;
      }
      this.content = this.getDialogContent(this.code);
    };

    if (this.tokenAction === 'exchange') {
      this._http
        .exchangeConnectToken(this.tokenID, false, true)
        .subscribe(successCallback, errorCallback);
    } else {
      if (this.data.connectData && this.data.connectData.direct) {
        this._http
          .adminConnectToken(this.asset, this.data.connectData, false, true)
          .subscribe(successCallback, errorCallback);
        return;
      }
      this._http
        .createConnectToken(this.asset, this.connectInfo, false, true)
        .subscribe(successCallback, errorCallback);
    }
  }

  onCancelFaceVerify() {
    this.closeDialog();
  }

  onConfirmReview() {
    const successCallback = (connToken: ConnectionToken) => {
      if (connToken && connToken.from_ticket) {
        this.connectionToken = connToken;
        this.code = 'ticket_review_pending';
        this.content = this.getDialogContent(this.code); // 重新生成 content
        this.checkTicket();
      }
    };
    const errorCallback = error => {
      if (error.error.code.startsWith('acl_')) {
        this.code = error.error.code;
      } else {
        this.code = 'other';
        this.otherError = error.error.detail;
      }
      this.content = this.getDialogContent(this.code);
    };

    if (this.tokenAction === 'exchange') {
      this._http.exchangeConnectToken(this.tokenID, true).subscribe(successCallback, errorCallback);
    } else {
      if (this.data.connectData && this.data.connectData.direct) {
        this._http
          .adminConnectToken(this.asset, this.data.connectData, true)
          .subscribe(successCallback, errorCallback);
        return;
      }
      this._http
        .createConnectToken(this.asset, this.connectInfo, true)
        .subscribe(successCallback, errorCallback);
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

    // @ts-ignore
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
            this._toastr.success(msg, '', { nzClass: 'custom-success-notification' }  );
            this.dialogRef.close(this.connectionToken);
          } else if (state === 'rejected') {
            this.code = 'ticket_review_rejected';
            this.content = this.getDialogContent(this.code);
          } else if (state === 'closed') {
            this.code = 'ticket_review_closed';
            this.content = this.getDialogContent(this.code);
          }
          clearInterval(this.timerCheckTicket);
        },
        error => {
          this.code = 'other';
          this.otherError = error.error.detail + `(${checkURL})`;
          this.content = this.getDialogContent(this.code);
          clearInterval(this.timerCheckTicket);
        }
      );
    }, 3000);
  }

  private getDialogContent(code: string): DialogContent {
    const vm = this;
    const contentMap: { [key: string]: DialogContent } = {
      acl_reject: {
        title: 'Login reminder',
        message: 'ACL reject login asset',
        isError: true,
        actions: [
          {
            text: 'Close',
            type: 'primary',
            callback: () => vm.closeDialog()
          }
        ]
      },
      acl_review: {
        title: 'Login reminder',
        message: 'Need review for login asset',
        actions: [
          {
            text: 'Cancel',
            callback: () => vm.onCancelReview()
          },
          {
            text: 'Confirm',
            type: 'primary',
            callback: () => vm.onConfirmReview()
          }
        ]
      },
      acl_face_online: {
        title: 'Login reminder',
        message: 'Face online required',
        actions: [
          {
            text: 'Cancel',
            callback: () => vm.onCancelFaceVerify()
          },
          {
            text: 'Confirm',
            type: 'primary',
            callback: () => vm.onConfirmFaceOnline()
          }
        ]
      },
      acl_face_verify: {
        title: 'Login reminder',
        message: 'Face verify required',
        actions: [
          {
            text: 'Cancel',
            callback: () => vm.onCancelFaceVerify()
          },
          {
            text: 'Confirm',
            type: 'primary',
            callback: () => vm.onConfirmFaceVerify()
          }
        ]
      },
      acl_face_online_not_supported: {
        title: 'Login reminder',
        message: 'FaceOnlineNotSupported',
        isError: true,
        actions: [
          {
            text: 'Close',
            callback: () => vm.closeDialog()
          }
        ]
      },
      no_face_feature: {
        title: 'Login reminder',
        message: 'No facial features',
        isError: true,
        customContent: {
          type: 'link',
          link: '/ui/#/profile/index',
          linkText: 'Go to profile'
        },
        actions: [
          {
            text: 'Close',
            callback: () => vm.closeDialog()
          }
        ]
      },
      ticket_review_pending: {
        title: 'Login reminder',
        message: 'Ticket review pending for login asset',
        customContent: {
          type: 'ticket',
          assignees:
            this.connectionToken?.from_ticket_info?.assignees?.join(', ') ||
            this.ticketAssignees ||
            '-',
          ticketUrl: this.connectionToken?.from_ticket_info?.ticket_detail_page_url
        },
        actions: [
          {
            text: 'Cancel',
            callback: () => vm.onCancelWait()
          },
          {
            text: 'Copy link',
            type: 'primary',
            callback: () => {
              vm.onCopySuccess(this.connectionToken?.from_ticket_info?.ticket_detail_page_url)
            }
          }
        ]
      },
      ticket_review_rejected: {
        title: 'Login reminder',
        message: 'Ticket review rejected for login asset',
        isError: true,
        actions: [
          {
            text: 'Close',
            callback: () => vm.closeDialog()
          }
        ]
      },
      ticket_review_closed: {
        title: 'Login reminder',
        message: 'Ticket review closed for login asset',
        isError: true,
        actions: [
          {
            text: 'Close',
            callback: () => vm.closeDialog()
          }
        ]
      },
      perm_account_invalid: {
        title: 'Login reminder',
        message: 'Account not found',
        isError: true,
        actions: [
          {
            text: 'Close',
            callback: () => vm.closeDialog()
          }
        ]
      },
      other: {
        title: 'Login reminder',
        message: this.otherError,
        isError: true,
        actions: [
          {
            text: 'Close',
            callback: () => vm.closeDialog()
          }
        ]
      }
    };

    return (
      contentMap[code] || {
        title: 'Login reminder',
        message: this.data.errorDetail,
        isError: true,
        actions: [
          {
            text: 'Close',
            callback: () => vm.closeDialog()
          }
        ]
      }
    );
  }
}
