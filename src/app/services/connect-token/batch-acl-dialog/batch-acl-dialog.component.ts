import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { writeText } from 'clipboard-polyfill';
import { Asset, ConnectData, ConnectionToken } from '@app/model';
import { HttpService } from '@app/services/http';
import { I18nService } from '@app/services/i18n';
import { Subscription } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FaceService } from '@app/services/face';
import { ActivatedRoute } from '@angular/router';
import { withUIBase } from '@app/utils/path';

type ReviewStatus =
  | 'review'
  | 'submitting'
  | 'pending'
  | 'verifying'
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'failed';

interface BatchReviewItem {
  asset: Asset;
  connectInfo: ConnectData;
  error: HttpErrorResponse;
  status: ReviewStatus;
  resolve?: (token: ConnectionToken) => void;
  resolved?: boolean;
  token?: ConnectionToken;
  detail?: string;
  assignees?: string;
  code?: string;
}

const ERROR_MESSAGE_KEYS: { [key: string]: string } = {
  acl_reject: 'ACL reject login asset',
  perm_account_invalid: 'Account not found',
  no_face_feature: 'No facial features'
};

const SINGLE_DIALOG_WIDTH = '450px';
const BATCH_DIALOG_WIDTH = '680px';

@Component({
  standalone: false,
  selector: 'elements-batch-acl-dialog',
  templateUrl: 'batch-acl-dialog.component.html',
  styleUrls: ['batch-acl-dialog.component.scss']
})
export class ElementBatchACLDialogComponent implements OnInit, OnDestroy {
  items: BatchReviewItem[] = [];
  code: string;
  submitted = false;
  faceVerifyUrl: SafeResourceUrl;
  readonly profileLink = withUIBase('#/profile/index');
  private timers = new Map<BatchReviewItem, number>();
  private subscriptions = new Subscription();
  private faceTimer: number;

  constructor(
    @Inject(NZ_MODAL_DATA) public data: any,
    private _http: HttpService,
    private _i18n: I18nService,
    private _toastr: NzNotificationService,
    private sanitizer: DomSanitizer,
    private faceService: FaceService,
    private _route: ActivatedRoute,
    public dialogRef: NzModalRef<ElementBatchACLDialogComponent>
  ) {}

  ngOnInit() {
    this.code = this.data.code;
    this.items = this.data.items.map(item => this.buildItem(item));
    this.syncDialogWidth();
  }

  ngOnDestroy() {
    this.clearTimers();
    clearInterval(this.faceTimer);
    this.subscriptions.unsubscribe();
    this.items.forEach(item => this.resolveItem(item, null));
  }

  get isReview(): boolean {
    return this.code === 'acl_review';
  }

  get isFaceVerify(): boolean {
    return ['acl_face_verify', 'acl_face_online'].includes(this.code);
  }

  get isActionable(): boolean {
    return this.isReview || this.isFaceVerify;
  }

  get isBatch(): boolean {
    return this.items.length > 1;
  }

  get singleItem(): BatchReviewItem {
    return this.items[0];
  }

  get titleKey(): string {
    if (this.faceVerifyUrl || (this.singleItem && this.singleItem.status === 'verifying')) {
      return 'Face Verify';
    }
    if (this.isBatch) {
      if (this.isReview) {
        return 'Login review';
      }
      if (this.isFaceVerify) {
        return 'Face Verify';
      }
    }
    return 'Login reminder';
  }

  get messageKey(): string {
    if (!this.isBatch) {
      if (this.singleItem && this.singleItem.status === 'failed' && this.singleItem.detail) {
        return this.singleItem.detail;
      }
      if (this.isReview) {
        const reviewMessages = {
          pending: 'Ticket review pending for login asset',
          rejected: 'Ticket review rejected for login asset',
          closed: 'Ticket review closed for login asset'
        };
        return (
          reviewMessages[this.singleItem && this.singleItem.status] || 'Need review for login asset'
        );
      }
      if (this.code === 'acl_face_online') {
        return 'Face online required';
      }
      if (this.code === 'acl_face_verify') {
        return this.singleItem && this.singleItem.status === 'verifying'
          ? 'Please complete the face verification'
          : 'Face verify required';
      }
      return this.resolveMessage(this.code, this.singleItem && this.singleItem.error);
    }
    if (this.isReview) {
      return this.submitted ? 'Batch review submitted message' : 'Batch review message';
    }
    if (this.code === 'acl_face_online') {
      return 'Batch face online message';
    }
    if (this.code === 'acl_face_verify') {
      return 'Batch face verification message';
    }
    return 'Batch same type error message';
  }

  get alertType(): 'info' | 'error' {
    if (this.isBatch) {
      return this.isActionable ? 'info' : 'error';
    }
    const status = this.singleItem && this.singleItem.status;
    if (this.isActionable && !['rejected', 'closed', 'failed'].includes(status)) {
      return 'info';
    }
    return 'error';
  }

  get actionTextKey(): string {
    if (!this.isBatch) {
      return 'Confirm';
    }
    return this.isReview ? 'Submit all reviews' : 'Start verification';
  }

  get closeTextKey(): string {
    if (!this.isActionable || (this.submitted && !this.hasPending)) {
      return 'Close';
    }
    return 'Cancel';
  }

  get hasPending(): boolean {
    return this.items.some(item => ['submitting', 'pending', 'verifying'].includes(item.status));
  }

  get isSubmitting(): boolean {
    return this.items.some(item => item.status === 'submitting');
  }

  get showPrimaryAction(): boolean {
    return this.isActionable && !this.submitted;
  }

  get showSinglePendingActions(): boolean {
    return (
      !this.isBatch && this.isReview && this.singleItem && this.singleItem.status === 'pending'
    );
  }

  get statusType(): { [key in ReviewStatus]: string } {
    return {
      review: 'warning',
      submitting: 'processing',
      pending: 'processing',
      verifying: 'processing',
      approved: 'success',
      rejected: 'error',
      closed: 'default',
      failed: 'error'
    };
  }

  addItem(data: any) {
    const item = this.buildItem(data);
    this.items.push(item);
    this.syncDialogWidth();
    if (!this.submitted) {
      return;
    }
    if (this.isReview) {
      this.createTicket(item);
    } else if (this.isFaceVerify) {
      this.verifyNextFace();
    }
  }

  shouldShowItemDetail(item: BatchReviewItem): boolean {
    if (!item.detail) {
      return false;
    }
    return item.detail !== ERROR_MESSAGE_KEYS[this.code];
  }

  onConfirm() {
    this.submitted = true;
    if (this.isReview) {
      this.items.forEach(item => this.createTicket(item));
      return;
    }
    this.verifyNextFace();
  }

  onClose() {
    this.items
      .filter(item => item.status === 'pending' && item.token)
      .forEach(item => this.closeTicket(item));
    this.clearTimers();
    clearInterval(this.faceTimer);
    this.items.forEach(item => this.resolveItem(item, null));
    this.dialogRef.close();
  }

  async onCopyLink(item: BatchReviewItem) {
    await writeText(item.token.from_ticket_info.ticket_detail_page_url);
    const message = await this._i18n.t('Copied');
    this._toastr.success(message, '', { nzClass: 'custom-success-notification' });
  }

  private createTicket(item: BatchReviewItem) {
    item.status = 'submitting';
    this.subscriptions.add(
      this._http.createConnectToken(item.asset, item.connectInfo, true).subscribe(
        token => {
          item.token = token;
          if (!token.from_ticket) {
            this.approveItem(item, token);
            return;
          }
          item.status = 'pending';
          item.assignees = token.from_ticket_info.assignees.join(', ') || '-';
          this.checkTicket(item);
        },
        error => {
          this.failItem(item, error);
        }
      )
    );
  }

  private verifyNextFace() {
    if (this.items.some(item => ['submitting', 'verifying'].includes(item.status))) {
      return;
    }
    this.faceVerifyUrl = null;
    const item = this.items.find(candidate => candidate.status === 'review');
    if (!item) {
      return;
    }
    item.status = 'submitting';
    let faceMonitorToken: string;
    if (this.code === 'acl_face_online') {
      faceMonitorToken =
        this._route.snapshot.queryParamMap.get('face_monitor_token') || this.faceService.getToken();
    }
    this.subscriptions.add(
      this._http
        .createConnectToken(item.asset, item.connectInfo, false, true, faceMonitorToken)
        .subscribe(
          token => {
            item.token = token;
            if (!token.face_token) {
              this.approveItem(item, token);
              this.verifyNextFace();
              return;
            }
            item.status = 'verifying';
            this.faceVerifyUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
              '/facelive/capture?token=' + token.face_token
            );
            this.checkFaceState(item, token);
          },
          error => {
            this.failItem(item, error);
            this.verifyNextFace();
          }
        )
    );
  }

  private checkFaceState(item: BatchReviewItem, token: ConnectionToken) {
    clearInterval(this.faceTimer);
    this.faceTimer = window.setInterval(() => {
      this.subscriptions.add(
        this._http.getFaceVerifyState(token.face_token).subscribe(
          async state => {
            if (!state.is_finished) {
              return;
            }
            clearInterval(this.faceTimer);
            this.faceVerifyUrl = null;
            if (state.success) {
              this.approveItem(item, token);
              const message = await this._i18n.t('Face verify success');
              this._toastr.success(message, '', { nzClass: 'custom-success-notification' });
              if (this.code === 'acl_face_online') {
                this.faceService.openFaceMonitor();
              }
            } else {
              item.status = 'failed';
              item.detail = state.error_message;
            }
            this.verifyNextFace();
          },
          error => {
            clearInterval(this.faceTimer);
            this.faceVerifyUrl = null;
            this.failItem(item, error);
            this.verifyNextFace();
          }
        )
      );
    }, 1000);
  }

  private checkTicket(item: BatchReviewItem) {
    const checkApi = item.token.from_ticket_info.check_ticket_api;
    const checkMethod = checkApi.method.toLowerCase();
    const timer = window.setInterval(() => {
      this.subscriptions.add(
        this._http[checkMethod](checkApi.url).subscribe(
          ticket => {
            if (ticket.status.value !== 'closed') {
              return;
            }
            this.clearTimer(item);
            const state = ticket.state.value;
            if (state === 'approved') {
              this.approveItem(item, item.token);
            } else if (state === 'rejected') {
              item.status = 'rejected';
            } else {
              item.status = 'closed';
            }
          },
          error => {
            this.clearTimer(item);
            this.failItem(item, error);
          }
        )
      );
    }, 3000);
    this.timers.set(item, timer);
  }

  private approveItem(item: BatchReviewItem, token: ConnectionToken) {
    item.status = 'approved';
    this.resolveItem(item, token);
    if (!this.isBatch) {
      window.setTimeout(() => this.dialogRef.close());
    }
  }

  private resolveItem(item: BatchReviewItem, token: ConnectionToken) {
    if (item.resolved) {
      return;
    }
    item.resolved = true;
    if (item.resolve) {
      item.resolve(token);
    }
  }

  private buildItem(data: any): BatchReviewItem {
    const code = data.code || this.code;
    return {
      ...data,
      code,
      status: this.isActionable ? 'review' : 'failed',
      detail: this.isActionable ? null : this.resolveMessage(code, data.error),
      resolved: false
    };
  }

  private failItem(item: BatchReviewItem, error: HttpErrorResponse) {
    const errorCode = error && error.error && error.error.code;
    item.status = 'failed';
    item.detail = this.resolveMessage(errorCode, error);
    if (!this.isBatch && errorCode) {
      this.code = errorCode;
    }
  }

  private closeTicket(item: BatchReviewItem) {
    const closeApi = item.token.from_ticket_info.close_ticket_api;
    const closeMethod = closeApi.method.toLowerCase();
    this._http[closeMethod](closeApi.url).subscribe();
  }

  private clearTimer(item: BatchReviewItem) {
    const timer = this.timers.get(item);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(item);
    }
  }

  private clearTimers() {
    this.timers.forEach(timer => clearInterval(timer));
    this.timers.clear();
  }

  private syncDialogWidth() {
    if (!this.dialogRef || !this.dialogRef.updateConfig) {
      return;
    }
    this.dialogRef.updateConfig({
      nzWidth: this.isBatch ? BATCH_DIALOG_WIDTH : SINGLE_DIALOG_WIDTH
    });
  }

  private resolveMessage(code: string, error?: HttpErrorResponse): string {
    if (ERROR_MESSAGE_KEYS[code]) {
      return ERROR_MESSAGE_KEYS[code];
    }
    return this.getErrorDetail(error) || code;
  }

  private getErrorDetail(error: HttpErrorResponse): string {
    if (!error) {
      return '';
    }
    if (error.status === 500) {
      return (error.message || '').toString();
    }
    const body = error.error;
    if (Array.isArray(body)) {
      return body.join(' ');
    }
    if (body && typeof body === 'object') {
      return body.detail || body.code || JSON.stringify(body);
    }
    return (body || error.message || '').toString();
  }
}
