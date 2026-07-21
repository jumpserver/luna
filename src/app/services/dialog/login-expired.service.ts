import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, Inject, Injectable } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';

import { getAppBasePath, withSitePrefix } from '@app/utils/path';
import { I18nService } from '../i18n';

interface LoginExpiredDialogData {
  loginText: string;
  loginUrl: string;
  message: string;
}

@Component({
  standalone: false,
  selector: 'elements-login-expired-dialog',
  template: `
    <div data-login-expired-dialog>
      <p>{{ data.message }}</p>
      <div class="login-expired-dialog-actions">
        <a
          nz-button
          nzType="primary"
          [href]="data.loginUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ data.loginText }}
        </a>
      </div>
    </div>
  `,
  styles: `
    .login-expired-dialog-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
  `
})
export class ElementLoginExpiredDialogComponent {
  constructor(@Inject(NZ_MODAL_DATA) public data: LoginExpiredDialogData) {}
}

@Injectable()
export class LoginExpiredDialogService {
  private active = false;
  private dialogRef: NzModalRef<ElementLoginExpiredDialogComponent> | null = null;
  private observer: MutationObserver | null = null;
  private restoreScheduled = false;

  constructor(
    private dialog: NzModalService,
    private i18n: I18nService,
    private overlayContainer: OverlayContainer
  ) {}

  showLoginExpired(): void {
    this.active = true;
    this.ensureObserver();
    this.ensureDialog();
  }

  clearLoginExpired(): void {
    this.active = false;
    this.restoreScheduled = false;
    this.observer?.disconnect();
    this.observer = null;

    const dialogRef = this.dialogRef;
    this.dialogRef = null;
    dialogRef?.destroy();
  }

  private ensureObserver(): void {
    if (this.observer || typeof MutationObserver === 'undefined' || !document.body) {
      return;
    }

    this.observer = new MutationObserver(() => this.scheduleEnsureDialog());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private scheduleEnsureDialog(): void {
    if (!this.active || this.restoreScheduled) {
      return;
    }

    this.restoreScheduled = true;
    queueMicrotask(() => {
      this.restoreScheduled = false;
      if (this.active) {
        this.ensureDialog();
      }
    });
  }

  private ensureDialog(): void {
    if (!this.active || this.isDialogIntact()) {
      return;
    }

    const container = this.overlayContainer.getContainerElement();
    if (!document.body.contains(container)) {
      document.body.appendChild(container);
    }

    const staleDialogRef = this.dialogRef;
    this.dialogRef = null;
    staleDialogRef?.destroy();

    const loginUrl = new URL(withSitePrefix('/core/auth/login/'), window.location.origin);
    loginUrl.searchParams.set('next', getAppBasePath());

    const dialogRef = this.dialog.create<ElementLoginExpiredDialogComponent>({
      nzTitle: this.i18n.instant('Tips'),
      nzContent: ElementLoginExpiredDialogComponent,
      nzData: {
        loginText: this.i18n.instant('Login'),
        loginUrl: loginUrl.toString(),
        message: this.i18n.instant('LoginExpireMsg')
      },
      nzWidth: '520px',
      nzCentered: true,
      nzClosable: false,
      nzMask: true,
      nzMaskClosable: false,
      nzKeyboard: false,
      nzCloseOnNavigation: false,
      nzFooter: null,
      nzZIndex: 10000,
      nzWrapClassName: 'login-expired-dialog-wrap'
    });

    this.dialogRef = dialogRef;
    dialogRef.afterClose.subscribe(() => {
      if (this.dialogRef === dialogRef) {
        this.dialogRef = null;
      }
      this.scheduleEnsureDialog();
    });
  }

  private isDialogIntact(): boolean {
    if (!this.dialogRef) {
      return false;
    }

    const container = this.overlayContainer.getContainerElement();
    const dialogElement = this.dialogRef.getElement();
    const backdropElement = this.dialogRef.getBackdropElement();
    const contentElement = dialogElement?.querySelector('[data-login-expired-dialog]');

    return Boolean(
      document.body.contains(container) &&
        document.body.contains(dialogElement) &&
        backdropElement &&
        document.body.contains(backdropElement) &&
        contentElement
    );
  }
}
