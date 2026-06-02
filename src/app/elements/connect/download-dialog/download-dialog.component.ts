import { Component, Inject, OnInit } from '@angular/core';
import { LOCAL_CLIENT_REMINDER_STORAGE_KEY } from '@app/utils/common';
import { withSitePrefix } from '@app/utils/path';
import { NZ_MODAL_DATA } from "ng-zorro-antd/modal";

@Component({
  standalone: false,
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'download-dialog.component.html',
  styleUrls: ['download-dialog.component.scss']
})
export class ElementDownloadDialogComponent implements OnInit {
  public ignoreRemind = false;
  private readonly legacyReminderStorageKey = 'hasDownLoadApp';

  constructor(
    @Inject(NZ_MODAL_DATA) public data: any,
  ) {
    this.ignoreRemind = data?.ignoreRemind || false;
  }

  ngOnInit() {
    const ignoreDownloadReminder = localStorage.getItem(LOCAL_CLIENT_REMINDER_STORAGE_KEY);
    const legacyIgnoreDownloadReminder = localStorage.getItem(this.legacyReminderStorageKey);

    if (ignoreDownloadReminder === '1' || legacyIgnoreDownloadReminder === '1') {
      this.ignoreRemind = true;
    }

    if (legacyIgnoreDownloadReminder === '1' && ignoreDownloadReminder !== '1') {
      localStorage.setItem(LOCAL_CLIENT_REMINDER_STORAGE_KEY, '1');
    }
    localStorage.removeItem(this.legacyReminderStorageKey);
  }

  private persistIgnoreRemind(): void {
    if (this.ignoreRemind) {
      localStorage.setItem(LOCAL_CLIENT_REMINDER_STORAGE_KEY, '1');
      return;
    }

    localStorage.removeItem(LOCAL_CLIENT_REMINDER_STORAGE_KEY);
  }

  onCancel(): void {
    this.persistIgnoreRemind();
  }

  onConfirm(): void {
    this.persistIgnoreRemind();
    window.open(withSitePrefix('/core/download/'), '_blank');
  }
}
